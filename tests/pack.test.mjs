import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildManifest,
  classifySource,
  commandFor,
  commandsFor,
  diffPlan,
  parseCommandText,
  renderInstallScript,
  renderReadme,
  sanitizeConfig,
  splitSpec,
  validateManifest,
  zipFileName,
} from '../lib/pack.mjs';

test('splitSpec：普通包、scoped 包、git/本地地址', () => {
  assert.deepEqual(splitSpec('dsh-ops@0.3.0'), { name: 'dsh-ops', version: '0.3.0' });
  assert.deepEqual(splitSpec('@scope/pkg@1.2.3'), { name: '@scope/pkg', version: '1.2.3' });
  assert.deepEqual(splitSpec('@scope/pkg'), { name: '@scope/pkg', version: null });
  assert.deepEqual(splitSpec('github:o/r#v1.0.0'), { name: null, version: null });
  assert.deepEqual(splitSpec('link:D:/x'), { name: null, version: null });
});

test('classifySource：registry / git / tarball / local', () => {
  assert.equal(classifySource('dsh-ops@0.3.0', 'dsh-ops', '0.3.0').kind, 'registry');
  assert.equal(classifySource('dsh-ops@0.3.0', 'dsh-ops', '0.3.0').spec, 'dsh-ops@0.3.0');
  assert.equal(classifySource('', 'dsh-ops', '0.3.0').spec, 'dsh-ops@0.3.0');
  assert.equal(classifySource('github:o/r#v1', 'x', '1.0.0').kind, 'git');
  assert.equal(classifySource('https://example.com/a.tgz', 'x', '1').kind, 'tarball');
  for (const local of ['link:D:/DSH Workspace/x', 'file:../x', 'D:/x', './x', '../x']) {
    const result = classifySource(local, 'x', '1');
    assert.equal(result.kind, 'local', local);
    assert.equal(result.installable, false, local);
  }
});

test('parseCommandText：解析用户给出的示例格式，但不执行', () => {
  const text = [
    '# 注释行',
    'dsh plugin --profile web add dsh-tokenledger@0.1.0',
    'dsh plugin --profile web add @deepseek-harness-tui/dsh-tui@0.16.0',
    'dsh plugin add github:1841220388zzzcccxxx-star/dsh-git-graph#v0.14.0',
    'dsh plugin --profile=desktop add "dsh-better-sidebar@0.28.0"',
    '不是命令的一行',
    '',
  ].join('\r\n');
  const parsed = parseCommandText(text);
  assert.equal(parsed.commands.length, 4);
  assert.deepEqual(parsed.commands[0], {
    spec: 'dsh-tokenledger@0.1.0',
    profile: 'web',
    raw: 'dsh plugin --profile web add dsh-tokenledger@0.1.0',
  });
  assert.equal(parsed.commands[1].spec, '@deepseek-harness-tui/dsh-tui@0.16.0');
  // github 的 # 不能被当注释截断
  assert.equal(parsed.commands[2].spec, 'github:1841220388zzzcccxxx-star/dsh-git-graph#v0.14.0');
  assert.equal(parsed.commands[2].profile, null);
  assert.equal(parsed.commands[3].spec, 'dsh-better-sidebar@0.28.0');
  assert.deepEqual(parsed.errors, ['不是命令的一行']);
});

test('commandFor：有/无 profile 两种形式', () => {
  assert.equal(commandFor('dsh-ops@0.3.0', 'desktop'), 'dsh plugin --profile desktop add dsh-ops@0.3.0');
  assert.equal(commandFor('dsh-ops@0.3.0', null), 'dsh plugin add dsh-ops@0.3.0');
});

test('sanitizeConfig：密钥键与明文 token 被剔除，apiKeyEnv 不误伤', () => {
  const input = {
    providers: {
      faro: {
        apiKey: 'sk-abcdefghijklmnop',
        apiKeyEnv: 'FARO_API_KEY',
        baseURL: 'https://example.com/v1',
        headers: { Authorization: 'Bearer xyz', 'x-extra': 'ok' },
      },
    },
    token: 'plain-token',
    nested: [{ secret: 's', keep: 1 }],
    note: 'key sk-0123456789abcdef should vanish',
  };
  const result = sanitizeConfig(input);
  assert.equal(result.value.providers.faro.apiKey, '${REDACTED}');
  assert.equal(result.value.providers.faro.apiKeyEnv, 'FARO_API_KEY');
  assert.equal(result.value.providers.faro.baseURL, 'https://example.com/v1');
  assert.equal(result.value.providers.faro.headers.Authorization, '${REDACTED}');
  assert.equal(result.value.providers.faro.headers['x-extra'], 'ok');
  assert.equal(result.value.token, '${REDACTED}');
  assert.equal(result.value.nested[0].secret, '${REDACTED}');
  assert.equal(result.value.nested[0].keep, 1);
  assert.match(result.value.note, /\[REDACTED\]/);
  assert.ok(result.redactions.length >= 4, `redactions=${result.redactions.length}`);
  // 原文不被修改
  assert.equal(input.providers.faro.apiKey, 'sk-abcdefghijklmnop');
});

test('diffPlan：同版本 / 版本不同 / 缺失 / 本地 / unknown', () => {
  const installed = [
    { name: 'a', version: '1.0.0', source: 'a@1.0.0' },
    { name: 'b', version: '2.0.0', source: 'b@2.0.0' },
    { name: 'g', version: '0.1.0', source: 'github:o/r#v0.1.0' },
  ];
  const plan = diffPlan(
    [
      { spec: 'a@1.0.0' },
      { spec: 'b@3.0.0' },
      { spec: 'c@1.0.0' },
      { spec: 'link:D:/local/x', local: true },
      { spec: 'github:o/r#v0.1.0', name: 'g' },
    ],
    installed,
    'desktop',
  );
  assert.deepEqual(plan.statuses, { same: 2, different: 1, missing: 1, local: 1, unknown: 0 });
  assert.equal(plan.entries[0].status, 'installed-same');
  assert.equal(plan.entries[1].status, 'installed-different');
  assert.equal(plan.entries[2].status, 'missing');
  assert.equal(plan.entries[3].status, 'local');
  assert.equal(plan.entries[4].status, 'installed-same');
  assert.equal(plan.entries[2].command, 'dsh plugin --profile desktop add c@1.0.0');
});

test('buildManifest + validateManifest + zipFileName', () => {
  const manifest = buildManifest({
    name: '  我的整合包  ',
    version: '1.2.3',
    profile: 'web',
    plugins: [
      { name: 'dsh-ops', version: '0.3.0', source: 'dsh-ops@0.3.0', rows: [{ patchId: 'dsh-ops-shell', moduleName: 'dsh-ops/shell' }] },
      { name: 'local-x', version: '1.0.0', source: 'link:D:/x' },
    ],
    config: [{ patchId: 'p', name: 'p', config: { a: 1 } }],
    warnings: ['w'],
  });
  assert.equal(manifest.format, 'dsh-modpack');
  assert.equal(manifest.stats.plugins, 2);
  assert.equal(manifest.stats.installable, 1);
  assert.equal(manifest.stats.local, 1);
  assert.equal(manifest.commands.length, 1);
  assert.equal(manifest.config.length, 1);
  assert.equal(validateManifest(manifest).name, '我的整合包');
  assert.equal(zipFileName('我的 整合包', '1.0.0'), '我的-整合包-1.0.0.dshpack.zip');
  assert.throws(() => validateManifest({ ...manifest, format: 'x' }), /不是 dsh-modpack/);
  assert.throws(() => validateManifest({ ...manifest, formatVersion: 99 }), /高于/);
});

test('README 与安装脚本可渲染且包含命令', () => {
  const manifest = buildManifest({
    name: 'Demo',
    version: '1.0.0',
    profile: 'desktop',
    plugins: [{ name: 'dsh-ops', version: '0.3.0', source: 'dsh-ops@0.3.0' }],
  });
  const readme = renderReadme(manifest);
  assert.match(readme, /# Demo 1\.0\.0/);
  assert.match(readme, /dsh plugin --profile desktop add dsh-ops@0\.3\.0/);
  assert.match(renderInstallScript(manifest, 'ps1'), /dsh plugin --profile desktop add/);
  assert.match(renderInstallScript(manifest, 'sh'), /^#!\/usr\/bin\/env sh/);
});

test('commandsFor 过滤本地插件并按名称排序', () => {
  const lines = commandsFor(
    [
      { name: 'z', spec: 'z@1', installable: true },
      { name: 'local', spec: 'link:D:/x', installable: false },
      { name: 'a', spec: 'a@2', installable: true },
    ],
    'web',
  );
  assert.deepEqual(lines, ['dsh plugin --profile web add a@2', 'dsh plugin --profile web add z@1']);
});
