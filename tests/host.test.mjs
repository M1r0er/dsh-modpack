import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { apply } from '../index.js';
import { readZip } from '../lib/zip.mjs';

/** 最小 Cordis 上下文替身：只实现 dsh-modpack 用到的服务与注册 API。 */
function makeContext({ bundles, plugins, configs = [], installs = [], enabledCalls = [], edits = [] }) {
  const tools = new Map();
  const routes = [];
  const manager = {
    async listBundles() {
      return bundles;
    },
    async listPlugins() {
      return plugins;
    },
    async installBundle(spec, options) {
      installs.push({ spec, options });
      return { application: 'applied', version: 'x', bundle: spec };
    },
    async setPluginEnabled(entryId, enabled) {
      enabledCalls.push({ entryId, enabled });
      return { application: 'applied' };
    },
  };
  const editor = {
    configuration() {
      return configs;
    },
    entries() {
      return configs.map((item) => item.entry);
    },
    async edit(entry, change) {
      edits.push({ entry, config: change({}, {}) });
    },
  };
  const webServer = {
    register(route) {
      routes.push(route);
      return () => {};
    },
  };
  const scopeBase = {
    effect(fn) {
      return fn();
    },
  };
  const ctx = {
    get(name) {
      if (name === 'pluginManager') return manager;
      if (name === 'configEditor') return editor;
      if (name === 'webServer') return webServer;
      return undefined;
    },
    effect(fn) {
      return fn();
    },
    inject(names, callback) {
      callback({
        ...scopeBase,
        get: (name) => ctx.get(name),
        webServer,
        effect: (fn) => fn(),
      });
    },
    tools: {
      register(definition) {
        tools.set(definition.name, definition);
        return () => {};
      },
    },
    logger: { warn() {} },
  };
  return { ctx, tools, routes, manager, editor };
}

const bundle = (name, version, extra = {}) => ({
  name,
  official: false,
  availability: 'profile',
  installed: true,
  enabled: true,
  removable: true,
  optional: false,
  version,
  source: `${name}@${version}`,
  description: `${name} desc`,
  rows: [{ rowId: name.replace(/^@/, '').replace(/[/.]/g, '-'), moduleName: name, entryId: `include:${name}` }],
  ...extra,
});

const liveRow = (name, enabled = true) => ({
  entryId: `include:${name}`,
  patchId: name.replace(/^@/, '').replace(/[/.]/g, '-'),
  moduleName: name,
  enabled,
});

function workspace() {
  return mkdtempSync(join(tmpdir(), 'dsh-modpack-test-'));
}

test('Host：导出 → 读包 → 预览，全链路不安装', async () => {
  const dir = workspace();
  const previous = process.env.DSH_MODPACK_DIR;
  const previousRegistry = process.env.DSH_MODPACK_REGISTRY_CHECK;
  process.env.DSH_MODPACK_DIR = dir;
  process.env.DSH_MODPACK_REGISTRY_CHECK = 'off';
  try {
    const { ctx, tools } = makeContext({
      bundles: [
        bundle('dsh-ops', '0.3.0', {
          rows: [{ rowId: 'dsh-ops-shell', moduleName: 'dsh-ops/shell', entryId: 'include:dsh-ops-shell' }],
        }),
        bundle('dsh-better-sidebar', '0.28.0'),
        bundle('dsh-local', '1.0.0', { source: 'link:D:/DSH Workspace/dsh-local' }),
      ],
      plugins: [liveRow('dsh-ops'), liveRow('dsh-better-sidebar'), liveRow('dsh-local')],
      configs: [
        {
          entry: { options: { id: 'dsh-ops-shell', name: 'dsh-ops/shell' } },
          override: { shell: 'bash', token: 'sk-abcdefghijklmnopqrst' },
          inherited: {},
        },
      ],
    });
    apply(ctx);

    const exportTool = tools.get('modpack_export');
    assert.ok(exportTool, '注册了 modpack_export');
    const result = await exportTool.execute({ name: '测试包', version: '9.9.9', includeConfig: true }, {});
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(result.path && existsSync(result.path), '写出了 zip');
    assert.ok(result.bytes < 200 * 1024, '小体积');
    assert.match(result.commandText, /dsh plugin(?: --profile \w+)? add dsh-ops@0\.3\.0/);
    assert.match(result.commandText, /dsh-better-sidebar@0\.28\.0/);
    assert.doesNotMatch(result.commandText, /dsh-local/, '本地链接不进命令');
    assert.match(result.warnings.join('\n'), /本机链接|本地链接/);
    assert.match(result.warnings.join('\n'), /REDACTED|密钥/);

    const files = readZip(readFileSync(result.path));
    for (const required of ['dshpack.json', 'install.ps1', 'install.sh', 'README.md']) {
      assert.ok(files.has(required), `包内有 ${required}`);
    }
    const manifest = JSON.parse(files.get('dshpack.json').toString('utf8'));
    assert.equal(manifest.format, 'dsh-modpack');
    assert.equal(manifest.name, '测试包');
    assert.equal(manifest.plugins.length, 3);
    assert.equal(manifest.plugins.find((p) => p.name === 'dsh-local').installable, false);
    assert.equal(manifest.config[0].config.token, '${REDACTED}');
    assert.equal(manifest.config[0].config.shell, 'bash');
    // 整个压缩包里不应出现明文密钥
    for (const [, data] of files) assert.doesNotMatch(data.toString('utf8'), /sk-abcdefghijklmnop/, '无明文密钥');

    const inspectTool = tools.get('modpack_inspect');
    const plan = await inspectTool.execute({ path: result.path }, {});
    assert.equal(plan.ok, true, JSON.stringify(plan));
    assert.equal(plan.source, 'archive');
    assert.equal(plan.statuses.same, 2);
    assert.equal(plan.statuses.local, 1);
    assert.equal(plan.configCount, 1);
    assert.match(plan.text, /已装同版本/);

    // 预览导入：不应触发任何安装
    const importTool = tools.get('modpack_import');
    const preview = await importTool.execute({ path: result.path }, {});
    assert.equal(preview.applied, false);
    assert.equal(preview.results.length, 0);
  } finally {
    if (previous === undefined) delete process.env.DSH_MODPACK_DIR;
    else process.env.DSH_MODPACK_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Host：导入 apply 只安装缺失/版本不同的插件，并写还原点', async () => {
  const dir = workspace();
  const previous = process.env.DSH_MODPACK_DIR;
  process.env.DSH_MODPACK_DIR = dir;
  const installs = [];
  const enabledCalls = [];
  const edits = [];
  try {
    const { ctx, tools } = makeContext({
      bundles: [bundle('dsh-ops', '0.3.0')],
      plugins: [liveRow('dsh-ops')],
      configs: [{ entry: { options: { id: 'dsh-ops-shell', name: 'dsh-ops/shell' } }, override: {}, inherited: {} }],
      installs,
      enabledCalls,
      edits,
    });
    apply(ctx);

    const importTool = tools.get('modpack_import');
    const text = [
      'dsh plugin --profile desktop add dsh-ops@0.3.0',
      'dsh plugin --profile desktop add dsh-new@1.2.3',
      '# 注释',
    ].join('\n');
    const preview = await importTool.execute({ text }, {});
    assert.equal(preview.applied, false);
    assert.equal(preview.plan.statuses.same, 1);
    assert.equal(preview.plan.statuses.missing, 1);

    const applied = await importTool.execute({ text, apply: true }, {});
    assert.equal(applied.ok, true, JSON.stringify(applied));
    assert.equal(applied.applied, true);
    assert.equal(installs.length, 1, '只安装缺失的那个');
    assert.equal(installs[0].spec, 'dsh-new@1.2.3');
    assert.equal(installs[0].options.saveExact, true);
    assert.ok(applied.backupPath && existsSync(applied.backupPath), '写了还原点');
    assert.ok(JSON.parse(readFileSync(applied.backupPath, 'utf8')).format === 'dsh-modpack-backup');
    assert.equal(enabledCalls.length, 0);
    assert.equal(edits.length, 0, '默认不应用配置');
  } finally {
    if (previous === undefined) delete process.env.DSH_MODPACK_DIR;
    else process.env.DSH_MODPACK_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Host：包内 disabled 行在导入时被关闭；withConfig 才应用配置', async () => {
  const dir = workspace();
  const previous = process.env.DSH_MODPACK_DIR;
  process.env.DSH_MODPACK_DIR = dir;
  const enabledCalls = [];
  const edits = [];
  try {
    const { ctx, tools } = makeContext({
      bundles: [
        bundle('dsh-ops', '0.3.0', {
          rows: [{ rowId: 'dsh-ops-shell', moduleName: 'dsh-ops/shell', entryId: 'include:dsh-ops-shell' }],
        }),
      ],
      plugins: [{ entryId: 'include:dsh-ops-shell', patchId: 'dsh-ops-shell', moduleName: 'dsh-ops/shell', enabled: true }],
      configs: [{ entry: { options: { id: 'dsh-ops-shell', name: 'dsh-ops/shell' } }, override: {}, inherited: {} }],
      enabledCalls,
      edits,
    });
    apply(ctx);
    // 构造一个带 disabled 行 + config 的整合包
    const { buildManifest } = await import('../lib/pack.mjs');
    const { createZip } = await import('../lib/zip.mjs');
    const manifest = buildManifest({
      name: 'Rows',
      version: '1.0.0',
      plugins: [
        {
          name: 'dsh-ops',
          version: '0.3.0',
          source: 'dsh-ops@0.3.0',
          rows: [{ patchId: 'dsh-ops-shell', moduleName: 'dsh-ops/shell', enabled: false }],
        },
      ],
      config: [{ patchId: 'dsh-ops-shell', name: 'dsh-ops/shell', config: { shell: 'pwsh' } }],
    });
    const archive = createZip([{ name: 'dshpack.json', data: JSON.stringify(manifest) }]);

    // 用临时文件走 path 分支
    const file = join(dir, 'rows.dshpack.zip');
    (await import('node:fs')).writeFileSync(file, archive);
    const applied = await tools.get('modpack_import').execute({ path: file, apply: true, withConfig: true }, {});
    assert.equal(applied.ok, true, JSON.stringify(applied));
    assert.deepEqual(enabledCalls, [{ entryId: 'include:dsh-ops-shell', enabled: false }]);
    assert.equal(edits.length, 1);
    assert.deepEqual(edits[0].config, { shell: 'pwsh' });
  } finally {
    if (previous === undefined) delete process.env.DSH_MODPACK_DIR;
    else process.env.DSH_MODPACK_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Host：本地链接但已在 npm 发布的插件可被导出，未发布的仍跳过', async () => {
  const dir = workspace();
  const previous = process.env.DSH_MODPACK_DIR;
  const previousRegistry = process.env.DSH_MODPACK_REGISTRY_CHECK;
  const previousFetch = globalThis.fetch;
  process.env.DSH_MODPACK_DIR = dir;
  delete process.env.DSH_MODPACK_REGISTRY_CHECK;
  // 只把 dsh-modpack-pub 当作已发布；dsh-local-unpub 返回 404。
  globalThis.fetch = async (url) => {
    if (String(url).includes('dsh-modpack-pub')) {
      return { ok: true, json: async () => ({ versions: { '0.2.0': {} } }) };
    }
    return { ok: false, json: async () => ({}) };
  };
  try {
    const { ctx, tools } = makeContext({
      bundles: [
        bundle('dsh-modpack-pub', '0.2.0', { source: 'link:D:/DSH Workspace/dsh-modpack-pub' }),
        bundle('dsh-local-unpub', '1.0.0', { source: 'link:D:/DSH Workspace/dsh-local-unpub' }),
      ],
      plugins: [liveRow('dsh-modpack-pub'), liveRow('dsh-local-unpub')],
    });
    apply(ctx);

    const result = await tools.get('modpack_export').execute({ name: '本地已发布测试', version: '1.0.0' }, {});
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.match(result.commandText, /dsh-modpack-pub@0\.2\.0/);
    assert.doesNotMatch(result.commandText, /dsh-local-unpub/);

    const manifest = JSON.parse(readZip(readFileSync(result.path)).get('dshpack.json').toString('utf8'));
    const published = manifest.plugins.find((plugin) => plugin.name === 'dsh-modpack-pub');
    assert.equal(published.installable, true);
    assert.equal(published.spec, 'dsh-modpack-pub@0.2.0');
    assert.equal(published.published, true);
    assert.equal(manifest.plugins.find((plugin) => plugin.name === 'dsh-local-unpub').installable, false);

    const plan = await tools.get('modpack_inspect').execute({ path: result.path }, {});
    assert.equal(plan.ok, true, JSON.stringify(plan));
    assert.equal(plan.statuses.local, 1, '只有未发布的本地包算 local 跳过');
  } finally {
    globalThis.fetch = previousFetch;
    if (previous === undefined) delete process.env.DSH_MODPACK_DIR;
    else process.env.DSH_MODPACK_DIR = previous;
    if (previousRegistry === undefined) delete process.env.DSH_MODPACK_REGISTRY_CHECK;
    else process.env.DSH_MODPACK_REGISTRY_CHECK = previousRegistry;
    rmSync(dir, { recursive: true, force: true });
  }
});
