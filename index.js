/**
 * dsh-modpack —— Host 半。
 *
 * 把"已安装的第三方插件"导成一个 PCL 式整合包：
 *   - 小体积 .dshpack.zip：只有清单、版本、安装命令、可选配置；不含 node_modules；
 *   - 同时直接给出 `dsh plugin --profile <p> add <spec>` 命令串，复制即可用；
 *   - 导入时先 plan（对比本机已装版本），确认后再通过 DSH 自己的
 *     pluginManager.installBundle 安装，不调用 shell、不执行粘贴的文本。
 *
 * 数据来源全部是 DSH 服务：
 *   pluginManager.listBundles()   → 已装 bundle、版本、install spec、bundle 行
 *   pluginManager.listPlugins()   → 行级启用状态
 *   configEditor.configuration()  → 用户 patch 层的 config override（可选导出）
 *
 * 人类界面在 client.js（设置 → 整合包）。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createZip, readZip } from './lib/zip.mjs';
import {
  buildManifest,
  classifySource,
  commandsFor,
  diffPlan,
  FORMAT,
  parseCommandText,
  renderInstallScript,
  renderReadme,
  sanitizeConfig,
  validateManifest,
  zipFileName,
} from './lib/pack.mjs';

export const name = 'dsh-modpack';
export const inject = ['tools'];

const ROUTE = '/modpack';
const PKG_NAME = 'dsh-modpack';
const MAX_BODY = 24 * 1024 * 1024;
const MANIFEST_FILE = 'dshpack.json';

function selfDir() {
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
}

function isProfileDir(dir) {
  try {
    const json = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    if (json && typeof json.dsh === 'object' && json.dsh && typeof json.dsh.profile === 'object') return true;
    return String(json?.name ?? '').startsWith('dsh-profile');
  } catch {
    return false;
  }
}

/** profile 名：环境变量 → 本包所在 node_modules 的上级 profile → link 安装时扫 profiles。 */
export function detectProfile() {
  try {
    if (process.env.DSH_PROFILE) return String(process.env.DSH_PROFILE);
  } catch {
    /* ignore */
  }
  const self = selfDir();
  let cursor = self;
  for (let i = 0; i < 8; i += 1) {
    const parent = dirname(cursor);
    if (basename(parent) === 'node_modules') {
      const profile = dirname(parent);
      if (isProfileDir(profile)) return basename(profile);
    }
    if (parent === cursor) break;
    cursor = parent;
  }
  try {
    const base = join(homedir(), '.dsh', 'profiles');
    const realSelf = (() => {
      try {
        return realpathSync(self);
      } catch {
        return self;
      }
    })();
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(base, entry.name, 'node_modules', ...PKG_NAME.split('/'));
      try {
        if (existsSync(candidate) && realpathSync(candidate) === realSelf) return entry.name;
      } catch {
        /* 下一个 profile */
      }
    }
  } catch {
    /* 没有 profiles 目录 */
  }
  return null;
}

/** DSH 版本：只作记录，探测不到就 null，不影响导出。 */
export function detectDshVersion() {
  try {
    if (process.env.DSH_VERSION) return String(process.env.DSH_VERSION);
  } catch {
    /* ignore */
  }
  try {
    const resources = process.resourcesPath;
    if (resources) {
      for (const rel of ['app.asar/package.json', 'app.asar/dsh/package.json']) {
        try {
          const json = JSON.parse(readFileSync(join(resources, ...rel.split('/')), 'utf8'));
          if (json && typeof json.version === 'string' && /^\d+\.\d+\.\d+/.test(json.version)) return json.version;
        } catch {
          /* 下一个候选 */
        }
      }
    }
  } catch {
    /* 非 Electron 环境 */
  }
  return null;
}

export function defaultOutDir() {
  try {
    if (process.env.DSH_MODPACK_DIR) return String(process.env.DSH_MODPACK_DIR);
  } catch {
    /* ignore */
  }
  return join(homedir(), '.dsh', 'modpacks');
}

function getService(ctx, service) {
  try {
    return ctx.get(service);
  } catch {
    return undefined;
  }
}

function json(res, code, value) {
  const body = JSON.stringify(value);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error(`请求体超过 ${Math.round(limit / 1024 / 1024)} MiB`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { ok: false, error: '返回值无法序列化为 JSON' };
  }
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(2)} MiB`;
}

function decodePackBase64(value) {
  let text = String(value ?? '').trim();
  const comma = text.indexOf(',');
  if (text.startsWith('data:') && comma >= 0) text = text.slice(comma + 1);
  if (!text) throw new Error('整合包内容为空');
  const buffer = Buffer.from(text, 'base64');
  if (!buffer.length) throw new Error('整合包 base64 解码失败');
  return buffer;
}

/** 把 pluginManager 的 bundle 列表 + 行状态整合成前端/工具能用的快照。 */
async function profileState(ctx) {
  const manager = getService(ctx, 'pluginManager');
  if (!manager || typeof manager.listBundles !== 'function') {
    throw new Error('pluginManager 服务不可用：本插件需要 DSH 内置插件管理器来读取/安装插件');
  }
  const [bundles, plugins] = await Promise.all([
    manager.listBundles(),
    typeof manager.listPlugins === 'function' ? manager.listPlugins() : Promise.resolve([]),
  ]);
  const rowByEntry = new Map();
  const rowByPatch = new Map();
  for (const row of Array.isArray(plugins) ? plugins : []) {
    if (row?.entryId) rowByEntry.set(String(row.entryId), row);
    if (row?.patchId) rowByPatch.set(String(row.patchId), row);
  }

  const list = [];
  for (const bundle of Array.isArray(bundles) ? bundles : []) {
    if (!bundle || bundle.availability !== 'profile' || bundle.installed === false) continue;
    const name = String(bundle.name ?? '');
    if (!name) continue;
    const rows = (Array.isArray(bundle.rows) ? bundle.rows : []).map((row) => {
      const patchId = String(row?.rowId ?? '');
      const live = row?.entryId ? rowByEntry.get(String(row.entryId)) : rowByPatch.get(patchId);
      return {
        patchId,
        moduleName: String(row?.moduleName ?? ''),
        enabled: live ? live.enabled !== false : true,
      };
    });
    list.push({
      name,
      version: bundle.version ? String(bundle.version) : null,
      source: bundle.source ? String(bundle.source) : '',
      spec: bundle.installTarget?.spec ? String(bundle.installTarget.spec) : '',
      description: String(bundle.description ?? ''),
      enabled: bundle.enabled !== false,
      official: bundle.official === true,
      optional: bundle.optional === true,
      removable: bundle.removable === true,
      rows,
    });
  }
  list.sort((a, b) => a.name.localeCompare(b.name));

  // classifySource 需要 name/version 兜底，这里统一在 Host 侧做一次
  const withKind = list.map((plugin) => {
    const classified = classifySource(plugin.source || plugin.spec, plugin.name, plugin.version);
    return {
      ...plugin,
      spec: classified.spec || plugin.spec,
      kind: classified.kind,
      installable: classified.installable !== false,
      local: classified.local === true,
    };
  });

  return {
    ok: true,
    profile: detectProfile(),
    dshVersion: detectDshVersion(),
    outDir: defaultOutDir(),
    plugins: withKind,
    stats: {
      total: withKind.length,
      installable: withKind.filter((plugin) => plugin.installable).length,
      local: withKind.filter((plugin) => plugin.local).length,
    },
  };
}

function resolveCwd(ctx, exec) {
  try {
    const workingDirectory = getService(ctx, 'workingDirectory');
    const agent = exec?.agent;
    const session = agent?.session;
    if (workingDirectory && session && typeof workingDirectory.get === 'function') {
      const dir = workingDirectory.get(session);
      if (typeof dir === 'string' && dir) return dir;
    }
  } catch {
    /* 退回进程 cwd */
  }
  try {
    return process.cwd();
  } catch {
    return homedir();
  }
}

function resolveOutputPath(output, cwd, name, version) {
  const fallback = join(defaultOutDir(), zipFileName(name, version));
  const raw = String(output ?? '').trim();
  if (!raw) return { file: fallback, dir: dirname(fallback) };
  const absolute = isAbsolute(raw) ? raw : resolve(cwd, raw);
  const extension = extname(absolute).toLowerCase();
  if (extension === '.zip' || extension === '.dshpack') {
    return { file: absolute, dir: dirname(absolute) };
  }
  return { file: join(absolute, zipFileName(name, version)), dir: absolute };
}

function uniqueFilePath(file) {
  if (!existsSync(file)) return file;
  const stem = file.replace(/\.dshpack\.zip$|\.zip$/i, '');
  const extension = file.slice(stem.length);
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${stem}-${i}${extension}`;
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error(`输出文件已存在：${file}`);
}

/** 收集选中插件的 config override（只收这些插件的行）。 */
function collectConfig(ctx, selected, redact) {
  const editor = getService(ctx, 'configEditor');
  if (!editor || typeof editor.configuration !== 'function') {
    return { config: [], redactions: [], warning: 'configEditor 服务不可用，已跳过配置导出。' };
  }
  const rowIds = new Set(selected.flatMap((plugin) => plugin.rows.map((row) => row.patchId)));
  const config = [];
  const redactions = [];
  try {
    for (const item of editor.configuration() ?? []) {
      const entry = item?.entry;
      const override = item?.override;
      if (!entry || !override || typeof override !== 'object') continue;
      if (Object.keys(override).length === 0) continue;
      const patchId = String(entry?.options?.id ?? entry?.id ?? '');
      if (!patchId || !rowIds.has(patchId)) continue;
      const sanitized = redact ? sanitizeConfig(override) : { value: override, redactions: [] };
      config.push({
        patchId,
        name: String(entry?.options?.name ?? entry?.name ?? ''),
        config: sanitized.value,
      });
      if (sanitized.redactions.length) redactions.push(...sanitized.redactions.map((path) => `${patchId}.${path}`));
    }
  } catch (error) {
    return { config: [], redactions: [], warning: `读取配置失败：${String(error?.message ?? error)}` };
  }
  return { config, redactions };
}

async function runExport(ctx, body, exec) {
  const snapshot = await profileState(ctx);
  const requested = Array.isArray(body?.include) && body.include.length ? new Set(body.include.map(String)) : null;
  const selected = snapshot.plugins.filter((plugin) => (requested ? requested.has(plugin.name) : true));
  if (!selected.length) throw new Error('没有选中任何插件');

  const name = String(body?.name ?? '').trim() || 'DSH 整合包';
  const version = String(body?.version ?? '').trim() || '1.0.0';
  const profile = body?.profile ? String(body.profile) : snapshot.profile;
  const warnings = [];

  const local = selected.filter((plugin) => plugin.local);
  if (local.length) {
    warnings.push(`${local.length} 个插件是本机链接/本地路径（${local.map((p) => p.name).join('、')}），没有公开下载地址，已标记为不可安装，导入时会跳过。`);
  }

  let config = [];
  let redactions = [];
  if (body?.includeConfig === true) {
    const collected = collectConfig(ctx, selected, body?.redactSecrets !== false);
    config = collected.config;
    redactions = collected.redactions;
    if (collected.warning) warnings.push(collected.warning);
    if (redactions.length) warnings.push(`配置中有 ${redactions.length} 处疑似密钥已替换为 \${REDACTED}：${redactions.slice(0, 8).join('、')}${redactions.length > 8 ? ' …' : ''}`);
  }

  const manifest = buildManifest({
    name,
    version,
    author: body?.author,
    description: body?.description,
    profile,
    dshVersion: snapshot.dshVersion,
    plugins: selected,
    config,
    secretsRedacted: body?.includeConfig === true && body?.redactSecrets !== false,
    warnings,
  });
  const commandText = manifest.commands.join('\n');
  const writeArchive = body?.writeArchive !== false;
  let file = null;
  let bytes = null;
  let sha256 = null;

  if (writeArchive) {
    const cwd = resolveCwd(ctx, exec);
    const target = resolveOutputPath(body?.outputDir ?? body?.output, cwd, name, version);
    mkdirSync(target.dir, { recursive: true });
    file = uniqueFilePath(target.file);
    const buffer = createZip([
      { name: MANIFEST_FILE, data: `${JSON.stringify(manifest, null, 2)}\n` },
      { name: 'install.ps1', data: renderInstallScript(manifest, 'ps1') },
      { name: 'install.sh', data: renderInstallScript(manifest, 'sh') },
      { name: 'README.md', data: renderReadme(manifest) },
    ]);
    writeFileSync(file, buffer);
    bytes = buffer.length;
    sha256 = createHash('sha256').update(buffer).digest('hex');
  }

  return {
    ok: true,
    path: file,
    bytes,
    sha256,
    commands: manifest.commands,
    commandText,
    manifest,
    warnings,
  };
}

function parsePackBuffer(buffer) {
  const files = readZip(buffer);
  const manifestRaw = files.get(MANIFEST_FILE);
  if (!manifestRaw) throw new Error(`压缩包里没有 ${MANIFEST_FILE}，不是 dsh-modpack 整合包`);
  let parsed;
  try {
    parsed = JSON.parse(manifestRaw.toString('utf8'));
  } catch {
    throw new Error(`${MANIFEST_FILE} 不是有效 JSON`);
  }
  return validateManifest(parsed);
}

async function runPlan(ctx, body) {
  const snapshot = await profileState(ctx);
  const installed = snapshot.plugins.map((plugin) => ({ name: plugin.name, version: plugin.version, source: plugin.source }));
  const profile = body?.profile ? String(body.profile) : snapshot.profile;

  if (body?.buffer || body?.pack) {
    const manifest = parsePackBuffer(body?.buffer ?? decodePackBuffer(body?.pack));
    const targets = (manifest.plugins ?? []).map((plugin) => ({ ...plugin, profile }));
    const plan = diffPlan(targets, installed, profile);
    const warnings = [...(Array.isArray(manifest.warnings) ? manifest.warnings : [])];
    if (plan.statuses.local) warnings.push(`包内 ${plan.statuses.local} 个插件是本地链接，无法自动安装，已跳过。`);
    return {
      ok: true,
      source: 'archive',
      name: manifest.name,
      version: manifest.version,
      profile,
      manifest,
      commands: plan.entries,
      statuses: plan.statuses,
      configCount: Array.isArray(manifest.config) ? manifest.config.length : 0,
      warnings,
    };
  }

  if (typeof body?.text === 'string' && body.text.trim()) {
    const parsed = parseCommandText(body.text);
    if (!parsed.commands.length) throw new Error('没有解析到任何 `dsh plugin … add <spec>` 命令');
    const targets = parsed.commands.map((command) => ({ spec: command.spec, local: false, profile }));
    const plan = diffPlan(targets, installed, profile);
    const warnings = [];
    if (parsed.errors.length) warnings.push(`${parsed.errors.length} 行无法识别，已忽略：${parsed.errors.slice(0, 3).join(' / ')}${parsed.errors.length > 3 ? ' …' : ''}`);
    return {
      ok: true,
      source: 'commands',
      name: null,
      version: null,
      profile,
      manifest: null,
      commands: plan.entries,
      statuses: plan.statuses,
      configCount: 0,
      warnings,
    };
  }

  throw new Error('缺少参数：pack（base64 压缩包）或 text（安装命令串）');
}

function decodePackBuffer(value) {
  return decodePackBase64(value);
}

async function writeBackup(ctx, snapshot) {
  const dir = join(defaultOutDir(), 'backups');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(dir, `before-import-${stamp}.json`);
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        format: 'dsh-modpack-backup',
        createdAt: new Date().toISOString(),
        profile: snapshot.profile,
        dshVersion: snapshot.dshVersion,
        plugins: snapshot.plugins,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return file;
}

async function runImport(ctx, body) {
  const plan = await runPlan(ctx, body);
  if (body?.apply !== true) {
    return { ok: true, applied: false, plan, results: [], backupPath: null, restartRequired: false };
  }

  const manager = getService(ctx, 'pluginManager');
  if (!manager || typeof manager.installBundle !== 'function') throw new Error('pluginManager 服务不可用，无法安装');
  const snapshot = await profileState(ctx);
  const backupPath = body?.backup === false ? null : await writeBackup(ctx, snapshot);
  const results = [];
  let restartRequired = false;

  for (const entry of plan.commands) {
    if (entry.status !== 'missing' && entry.status !== 'installed-different') {
      results.push({ spec: entry.spec, action: 'skipped', ok: true, reason: entry.status === 'local' ? '本地链接，跳过' : '已安装同版本' });
      continue;
    }
    try {
      const outcome = await manager.installBundle(entry.spec, { enabled: true, saveExact: true });
      const application = outcome?.application;
      if (application === 'restart-required') restartRequired = true;
      results.push({
        spec: entry.spec,
        action: entry.status === 'installed-different' ? 'updated' : 'installed',
        ok: application !== 'failed',
        application: application ?? null,
        version: outcome?.version ?? null,
        error: outcome?.error ? String(outcome.error.diagnostic ?? outcome.error.code ?? JSON.stringify(outcome.error)) : undefined,
        warnings: outcome?.warnings,
      });
    } catch (error) {
      results.push({ spec: entry.spec, action: 'failed', ok: false, error: String(error?.message ?? error) });
    }
  }

  // 行级启用状态：只处理包里明确标了 disabled 的行
  if (plan.manifest?.plugins?.some((plugin) => plugin.rows?.some((row) => row.enabled === false))) {
    try {
      const liveRows = await manager.listPlugins();
      const byPatch = new Map();
      for (const row of liveRows ?? []) if (row?.patchId) byPatch.set(String(row.patchId), row);
      for (const plugin of plan.manifest.plugins) {
        for (const row of plugin.rows ?? []) {
          if (row.enabled !== false) continue;
          const live = byPatch.get(row.patchId);
          if (!live?.entryId) {
            results.push({ spec: plugin.name, action: 'row', ok: false, error: `找不到行 ${row.patchId}` });
            continue;
          }
          if (live.enabled === false) {
            results.push({ spec: plugin.name, action: 'row', ok: true, reason: `${row.patchId} 已是禁用` });
            continue;
          }
          try {
            const outcome = await manager.setPluginEnabled(live.entryId, false);
            if (outcome?.application === 'restart-required') restartRequired = true;
            results.push({ spec: plugin.name, action: 'row', ok: outcome?.application !== 'failed', reason: `禁用行 ${row.patchId}` });
          } catch (error) {
            results.push({ spec: plugin.name, action: 'row', ok: false, error: String(error?.message ?? error) });
          }
        }
      }
    } catch (error) {
      results.push({ spec: '(rows)', action: 'row', ok: false, error: String(error?.message ?? error) });
    }
  }

  // 配置：默认不应用，必须显式 withConfig
  if (body?.withConfig === true && Array.isArray(plan.manifest?.config) && plan.manifest.config.length) {
    const editor = getService(ctx, 'configEditor');
    if (!editor || typeof editor.edit !== 'function') {
      results.push({ spec: '(config)', action: 'config', ok: false, error: 'configEditor 服务不可用' });
    } else {
      const entries = editor.entries?.() ?? [];
      const byKey = new Map();
      for (const entry of entries) {
        for (const key of [entry?.options?.id, entry?.id, entry?.options?.name]) {
          if (key) byKey.set(String(key), entry);
        }
      }
      for (const item of plan.manifest.config) {
        const entry = byKey.get(String(item.patchId));
        if (!entry) {
          results.push({ spec: item.patchId, action: 'config', ok: false, reason: '本机没有这条插件行，跳过配置' });
          continue;
        }
        try {
          await editor.edit(entry, () => item.config);
          results.push({ spec: item.patchId, action: 'config', ok: true });
        } catch (error) {
          results.push({ spec: item.patchId, action: 'config', ok: false, error: String(error?.message ?? error) });
        }
      }
    }
  }

  return {
    ok: true,
    applied: true,
    plan,
    results,
    backupPath,
    restartRequired,
  };
}

function exportText(result) {
  const lines = [];
  if (result.path) {
    lines.push(`整合包已导出：${result.path}`);
    lines.push(`大小：${formatBytes(result.bytes)}（不含插件代码 / node_modules）`);
    if (result.sha256) lines.push(`SHA-256：${result.sha256}`);
  } else {
    lines.push('已生成安装命令（未写压缩包）。');
  }
  lines.push('', `插件 ${result.manifest.stats.plugins} 个，其中可安装 ${result.manifest.stats.installable} 个。`, '', '安装命令：', '');
  lines.push(result.commandText || '# （没有可安装的插件）');
  if (result.warnings.length) {
    lines.push('', '注意：', ...result.warnings.map((warning) => `- ${warning}`));
  }
  return lines.join('\n');
}

function planText(plan) {
  const statusLabel = {
    'installed-same': '已装同版本',
    'installed-different': '已装不同版本',
    missing: '待安装',
    local: '本地链接（跳过）',
    unknown: '无法识别',
  };  const lines = [];
  lines.push(`来源：${plan.source === 'archive' ? '整合包压缩包' : '粘贴的命令串'}`);
  if (plan.name) lines.push(`整合包：${plan.name} ${plan.version ?? ''}`);
  lines.push(`目标 profile：${plan.profile ?? '（默认）'}`);
  lines.push(
    `统计：同版本 ${plan.statuses.same} / 版本不同 ${plan.statuses.different} / 待安装 ${plan.statuses.missing} / 本地 ${plan.statuses.local}${plan.statuses.unknown ? ` / 无法识别 ${plan.statuses.unknown}` : ''}`,
  );
  if (plan.configCount) lines.push(`包内配置 override：${plan.configCount} 条（应用需显式 withConfig）`);
  lines.push('');
  for (const entry of plan.commands) {
    lines.push(`[${statusLabel[entry.status] ?? entry.status}] ${entry.spec}`);
  }
  if (plan.warnings.length) lines.push('', '注意：', ...plan.warnings.map((warning) => `- ${warning}`));
  return lines.join('\n');
}

function importText(result) {
  if (!result.applied) return `未应用改动（预览模式）。\n\n${planText(result.plan)}`;
  const lines = [`已执行导入（${result.results.length} 个动作）。`];
  if (result.backupPath) lines.push(`还原点：${result.backupPath}`);
  lines.push('', ...result.results.map((item) => `- [${item.ok ? 'OK' : 'FAIL'}] ${item.action} ${item.spec}${item.error ? ` — ${item.error}` : item.reason ? ` — ${item.reason}` : ''}`));
  if (result.restartRequired) lines.push('', '部分改动需要重启 DSH 才会生效（restart-required）。');
  return lines.join('\n');
}

function resolveInputPath(ctx, exec, input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new Error('缺少 path');
  const absolute = isAbsolute(raw) ? raw : resolve(resolveCwd(ctx, exec), raw);
  if (!existsSync(absolute)) throw new Error(`文件不存在：${absolute}`);
  return absolute;
}

export function apply(ctx) {
  const warn = (message) => {
    try {
      ctx.logger?.warn?.(`[dsh-modpack] ${message}`);
    } catch {
      /* ignore */
    }
  };

  const routeHandler = async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://dsh.local');
      const tail = url.pathname.replace(/\/+$/, '').split('/').pop();
      if (req.method === 'GET' && tail === 'state') return json(res, 200, await profileState(ctx));
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
      const body = JSON.parse((await readBody(req)) || '{}');
      if (tail === 'export') return json(res, 200, await runExport(ctx, body, null));
      if (tail === 'plan') return json(res, 200, await runPlan(ctx, body));
      if (tail === 'import') return json(res, 200, await runImport(ctx, body));
      return json(res, 404, { ok: false, error: 'not_found', path: url.pathname });
    } catch (error) {
      const message = String(error?.message ?? error);
      warn(`route error: ${message}`);
      return json(res, 500, { ok: false, error: message });
    }
  };

  ctx.inject(['webServer'], (scope) => {
    scope.effect(() =>
      scope.webServer.register({
        kind: 'prefix',
        path: ROUTE,
        handler: (req, res) => {
          void routeHandler(req, res);
        },
      }),
    );
  });

  ctx.effect(() =>
    ctx.tools.register({
      name: 'modpack_list',
      description:
        '列出当前 DSH profile 里已安装的第三方插件（bundle），含版本、可安装 spec、是否本地链接，以及默认导出目录。用于挑选要导出进整合包的插件。',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      deferLoading: false,
      async execute() {
        return safeJson(await profileState(ctx));
      },
    }),
  );

  ctx.effect(() =>
    ctx.tools.register({
      name: 'modpack_export',
      description:
        '把选中的已安装第三方插件导出为 PCL 式整合包：生成小体积 .dshpack.zip（只含清单、版本、安装命令，可选配置；不含插件代码），同时返回可直接复制执行的 `dsh plugin --profile <p> add <spec>` 命令串。不会安装任何东西。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', description: '整合包名称，默认「DSH 整合包」。' },
          version: { type: 'string', description: '整合包版本，默认 1.0.0。' },
          author: { type: 'string', description: '作者，可选。' },
          description: { type: 'string', description: '简介，可选。' },
          include: {
            type: 'array',
            items: { type: 'string' },
            description: '要包含的 bundle 包名列表；省略或空数组 = 全部已安装第三方插件。可先用 modpack_list 查看。',
          },
          output: { type: 'string', description: '输出路径：目录（默认 ~/.dsh/modpacks）或 .zip/.dshpack 文件路径；相对路径按当前会话工作目录解析。' },
          writeArchive: { type: 'boolean', description: 'false = 只生成命令串、不写压缩包；默认 true。' },
          includeConfig: { type: 'boolean', description: '是否把选中插件的 config override 一并写入包（默认 false）。' },
          redactSecrets: { type: 'boolean', description: 'includeConfig 时是否剔除疑似密钥，默认 true。' },
          profile: { type: 'string', description: '命令里的 --profile 值；默认探测当前 profile。' },
        },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: exportText(value) }],
      },
      deferLoading: false,
      async execute(args, exec) {
        try {
          const result = await runExport(ctx, args ?? {}, exec);
          return safeJson({ ...result, text: exportText(result) });
        } catch (error) {
          return safeJson({ ok: false, error: String(error?.message ?? error) });
        }
      },
    }),
  );

  ctx.effect(() =>
    ctx.tools.register({
      name: 'modpack_inspect',
      description:
        '读取一个 .dshpack.zip / .zip 整合包或一段安装命令串，预览它会做什么：逐条列出 spec、与当前 profile 的已装版本对比（同版本/版本不同/待安装/本地链接），不会安装任何东西。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', description: '.dshpack.zip / .zip 文件路径；相对路径按当前会话工作目录解析。' },
          text: { type: 'string', description: '也可以直接给安装命令串（每行一条 dsh plugin … add <spec>），与 path 二选一。' },
          profile: { type: 'string', description: '可选：命令里的 --profile 值。' },
        },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: value?.text ?? JSON.stringify(value, null, 2) }],
      },
      deferLoading: false,
      async execute(args, exec) {
        try {
          const body = {};
          if (typeof args?.text === 'string' && args.text.trim()) body.text = args.text;
          else body.buffer = readFileSync(resolveInputPath(ctx, exec, args?.path));
          if (args?.profile) body.profile = args.profile;
          const plan = await runPlan(ctx, body);
          return safeJson({ ...plan, text: planText(plan) });
        } catch (error) {
          return safeJson({ ok: false, error: String(error?.message ?? error) });
        }
      },
    }),
  );

  ctx.effect(() =>
    ctx.tools.register({
      name: 'modpack_import',
      description:
        '导入 .dshpack.zip 整合包或安装命令串：默认只做计划预览（apply=false）；apply=true 时先写 JSON 还原点，再通过 DSH 的 pluginManager.installBundle 按 spec 安装缺失/版本不同的插件（不执行 shell 命令）。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', description: '.dshpack.zip / .zip 文件路径；与 text 二选一。' },
          text: { type: 'string', description: '安装命令串（每行一条 dsh plugin … add <spec>）。' },
          apply: { type: 'boolean', description: '默认 false 只预览；true 才会真正安装。' },
          withConfig: { type: 'boolean', description: '是否应用包内 config override（默认 false）。' },
          profile: { type: 'string', description: '可选：命令里的 --profile 值。' },
        },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: value?.text ?? JSON.stringify(value, null, 2) }],
      },
      deferLoading: false,
      async execute(args, exec) {
        try {
          const body = { apply: args?.apply === true, withConfig: args?.withConfig === true };
          if (typeof args?.text === 'string' && args.text.trim()) body.text = args.text;
          else body.buffer = readFileSync(resolveInputPath(ctx, exec, args?.path));
          if (args?.profile) body.profile = args.profile;
          const result = await runImport(ctx, body);
          const text = result.applied ? importText(result) : `未应用改动（预览模式）。\n\n${planText(result.plan)}`;
          return safeJson({ ...result, text });
        } catch (error) {
          return safeJson({ ok: false, error: String(error?.message ?? error) });
        }
      },
    }),
  );
}
