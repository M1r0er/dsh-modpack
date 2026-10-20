/**
 * 整合包清单（dshpack.json）的纯函数层：不碰 DSH 服务、不读写文件，
 * 便于单测。Host 半（index.js）负责把 pluginManager / configEditor 的
 * 运行时数据喂进来，并执行安装。
 */

export const FORMAT = 'dsh-modpack';
export const FORMAT_VERSION = 1;
export const DEFAULT_NAME = 'DSH 整合包';
export const DEFAULT_VERSION = '1.0.0';

const SECRET_KEYS = new Set([
  'apikey',
  'apitoken',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'clientsecret',
  'password',
  'passwd',
  'credential',
  'credentials',
  'authorization',
  'cookie',
  'privatekey',
  'secretkey',
  'sessionkey',
]);

const SECRET_VALUE_TEST = /(^|[^A-Za-z0-9])(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})/;
const SECRET_VALUE_GLOBAL = new RegExp(SECRET_VALUE_TEST.source, 'g');

export function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[-_\s]/g, '');
}

/**
 * 递归剔除疑似凭据。键名按"归一化后完全相等"判断，避免把 apiKeyEnv 这种
 * "环境变量名"误伤；值里形如 sk- / ghp_ / xoxb- 的明文也会被替换。
 * @returns {{value: unknown, redactions: string[]}}
 */
export function sanitizeConfig(value, path = '', out = []) {
  if (Array.isArray(value)) {
    const next = value.map((item, index) => sanitizeConfig(item, `${path}[${index}]`, out).value);
    return { value: next, redactions: out };
  }
  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (SECRET_KEYS.has(normalizeKey(key))) {
        if (child !== undefined && child !== null && child !== '') out.push(childPath);
        next[key] = '${REDACTED}';
        continue;
      }
      next[key] = sanitizeConfig(child, childPath, out).value;
    }
    return { value: next, redactions: out };
  }
  if (typeof value === 'string' && SECRET_VALUE_TEST.test(value)) {
    const replaced = value.replace(SECRET_VALUE_GLOBAL, (match, prefix) => `${prefix}[REDACTED]`);
    if (replaced !== value) out.push(path || '(value)');
    return { value: replaced, redactions: out };
  }
  return { value, redactions: out };
}

/** 把 `name@version` 拆开（scoped 包取最后一个 @）。非 npm spec 返回 name:null。 */
export function splitSpec(spec) {
  const raw = String(spec ?? '').trim();
  if (!raw) return { name: null, version: null };
  if (/^(github:|git\+|git:|https?:|link:|file:|workspace:)/i.test(raw)) return { name: null, version: null };
  if (/^(\.{0,2}[\\/]|[A-Za-z]:[\\/])/.test(raw)) return { name: null, version: null };
  const at = raw.lastIndexOf('@');
  if (at > 0) {
    const name = raw.slice(0, at);
    const version = raw.slice(at + 1);
    if (name && version && !version.includes('/')) return { name, version };
  }
  return { name: raw, version: null };
}

/** 本地安装来源：link: / file: / workspace: / 相对或绝对路径。 */
export function isLocalSource(source) {
  return /^(link:|file:|workspace:|\.{0,2}[\\/]|[A-Za-z]:[\\/])/i.test(String(source ?? '').trim());
}

const NPM_NAME_RE = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/i;
const NPM_VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * 本地链接包若能在 npm 上按 name@version 找到，就给出可移植的 registry spec。
 * 只做纯计算；是否真的已发布由调用方注入的 probe 判定。
 * @returns {string|null} `name@version` 或 null（不是本地来源 / 坐标不合法）。
 */
export function registryCandidate(source, name, version) {
  if (!isLocalSource(source)) return null;
  const packageName = String(name ?? '').trim();
  const packageVersion = String(version ?? '').trim();
  if (!NPM_NAME_RE.test(packageName) || !NPM_VERSION_RE.test(packageVersion)) return null;
  return `${packageName}@${packageVersion}`;
}

/**
 * 把本地链接插件升级成可分享条目：probe(name, version) 返回 true 才换 spec。
 * probe 失败/未发布时保持原样（沿用“本机链接不可分享”的旧行为）。
 * @param {Array<object>} plugins - profileState 里的插件条目。
 * @param {(name: string, version: string) => Promise<boolean>} probe - registry 判定。
 */
export async function upgradeLocalPlugins(plugins, probe) {
  const list = Array.isArray(plugins) ? plugins : [];
  return Promise.all(list.map(async (plugin) => {
    if (!plugin || plugin.local !== true) return plugin;
    const candidate = registryCandidate(plugin.source ?? plugin.spec, plugin.name, plugin.version);
    if (!candidate) return plugin;
    let published = false;
    try {
      published = (await probe(plugin.name, plugin.version)) === true;
    } catch {
      published = false;
    }
    return published
      ? { ...plugin, spec: candidate, installable: true, published: true }
      : plugin;
  }));
}

/** 把 bundle.source 归类成可展示/可判断的 install spec。 */
export function classifySource(source, name, version) {
  const raw = String(source ?? '').trim();
  const fallback = name && version ? `${name}@${version}` : String(name ?? '');
  if (!raw) return { kind: 'unknown', spec: fallback, installable: Boolean(fallback), local: false };
  if (/^(link:|file:|workspace:|\.{0,2}[\\/]|[A-Za-z]:[\\/])/i.test(raw)) {
    return { kind: 'local', spec: raw, installable: false, local: true };
  }
  if (/^(github:|git\+|git:)/i.test(raw)) return { kind: 'git', spec: raw, installable: true, local: false };
  if (/^https?:/i.test(raw) || /\.(tgz|tar\.gz)$/i.test(raw)) {
    return { kind: 'tarball', spec: raw, installable: true, local: false };
  }
  // 普通 registry 源：`name@version`，必要时补上版本
  const parsed = splitSpec(raw);
  if (parsed.name && !parsed.version && version) return { kind: 'registry', spec: `${parsed.name}@${version}`, installable: true, local: false };
  if (parsed.name) return { kind: 'registry', spec: raw, installable: true, local: false };
  return { kind: 'unknown', spec: fallback, installable: true, local: false };
}

export function commandFor(spec, profile) {
  const prefix = profile ? `dsh plugin --profile ${profile} add` : 'dsh plugin add';
  return `${prefix} ${spec}`;
}

export function commandsFor(plugins, profile) {
  return [...plugins]
    .filter((plugin) => plugin && plugin.installable && plugin.spec)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((plugin) => commandFor(plugin.spec, profile));
}

const COMMAND_RE = /^\s*dsh(?:\.cmd|\.exe)?\s+plugin\s+(?:(?:--profile|-p)(?:=|\s+)(\S+)\s+)?add\s+(.+?)\s*$/i;

/**
 * 解析粘贴进来的安装命令串。只认 `dsh plugin [--profile x] add <spec>`，
 * `#` 开头为注释。github:owner/repo#tag 里的 # 不能被当注释。
 * @returns {{commands: Array<{spec: string, profile: string|null, raw: string}>, errors: string[]}}
 */
export function parseCommandText(text) {
  const commands = [];
  const errors = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(COMMAND_RE);
    if (!match) {
      errors.push(trimmed);
      continue;
    }
    let spec = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!spec) {
      errors.push(trimmed);
      continue;
    }
    commands.push({ spec, profile: match[1] ?? null, raw: trimmed });
  }
  return { commands, errors };
}

/** 只保留清单需要的字段，避免把 Loader 对象写进 zip。 */
export function normalizePlugin(input) {
  const name = String(input?.name ?? '');
  const version = input?.version ? String(input.version) : null;
  const classified = classifySource(input?.source ?? input?.spec, name, version);
  // Host 侧已确认“本地链接但 npm 已发布”的条目会带上可移植 spec；保留它，
  // 否则再次 classifySource 会把 spec 退回 link: 路径、installable 变回 false。
  const candidate = registryCandidate(input?.source, name, version);
  const advertised = input?.installable === true && input?.published === true && candidate !== null && String(input?.spec ?? '') === candidate
    ? candidate
    : null;
  const rows = Array.isArray(input?.rows)
    ? input.rows
        .filter((row) => row && row.patchId)
        .map((row) => ({
          patchId: String(row.patchId),
          moduleName: String(row.moduleName ?? ''),
          enabled: row.enabled !== false,
        }))
    : [];
  return {
    name,
    version,
    spec: advertised ?? classified.spec,
    kind: classified.kind,
    installable: advertised !== null ? true : classified.installable !== false,
    local: classified.local === true,
    ...(advertised !== null ? { published: true } : {}),
    source: String(input?.source ?? ''),
    description: String(input?.description ?? ''),
    enabled: input?.enabled !== false,
    rows,
  };
}

export function zipFileName(name, version) {
  const base = `${slugify(name)}-${slugify(version || DEFAULT_VERSION)}`.replace(/^-+|-+$/g, '');
  return `${base || 'dsh-modpack'}.dshpack.zip`;
}

export function slugify(value) {
  return String(value ?? '')
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function buildManifest(input) {
  const plugins = (Array.isArray(input?.plugins) ? input.plugins : [])
    .map(normalizePlugin)
    .filter((plugin) => plugin.name);
  const commands = commandsFor(plugins, input?.profile ?? null);
  const manifest = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    name: String(input?.name ?? '').trim() || DEFAULT_NAME,
    version: String(input?.version ?? '').trim() || DEFAULT_VERSION,
    author: String(input?.author ?? '').trim(),
    description: String(input?.description ?? '').trim(),
    createdAt: String(input?.createdAt || new Date().toISOString()),
    profile: input?.profile ? String(input.profile) : null,
    dshVersion: input?.dshVersion ? String(input.dshVersion) : null,
    plugins,
    commands,
    secretsRedacted: input?.secretsRedacted === true,
    warnings: Array.isArray(input?.warnings) ? input.warnings.map(String) : [],
    stats: {
      plugins: plugins.length,
      installable: plugins.filter((plugin) => plugin.installable).length,
      local: plugins.filter((plugin) => plugin.local).length,
      commands: commands.length,
    },
  };
  if (Array.isArray(input?.config) && input.config.length) {
    manifest.config = input.config.map((entry) => ({
      patchId: String(entry.patchId),
      name: String(entry.name ?? ''),
      config: entry.config ?? {},
    }));
    manifest.stats.config = manifest.config.length;
  }
  return manifest;
}

export function validateManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('dshpack.json 不是对象');
  if (value.format !== FORMAT) throw new Error(`不是 ${FORMAT} 整合包（format=${String(value.format)}）`);
  const version = Number(value.formatVersion);
  if (!Number.isFinite(version) || version < 1) throw new Error('dshpack.json 缺少有效的 formatVersion');
  if (version > FORMAT_VERSION) throw new Error(`整合包格式版本 ${version} 高于本插件支持的 ${FORMAT_VERSION}，请升级 dsh-modpack`);
  if (!Array.isArray(value.plugins)) throw new Error('dshpack.json 缺少 plugins 数组');
  for (const plugin of value.plugins) {
    if (!plugin || typeof plugin.name !== 'string' || !plugin.name) throw new Error('plugins 中存在缺少 name 的条目');
    if (typeof plugin.spec !== 'string' || !plugin.spec) throw new Error(`插件 ${plugin.name} 缺少 spec`);
  }
  return value;
}

/**
 * 与当前 profile 对比。
 * @param {Array<{name: string, version: string|null}>} targets
 * @param {Array<{name: string, version: string|null}>} installed
 */
const NON_REGISTRY = /^(github:|git\+|git:|https?:)/i;

export function diffPlan(targets, installed, profile = null) {
  const have = new Map((installed || []).map((item) => [item.name, item]));
  const statuses = { same: 0, different: 0, missing: 0, local: 0, unknown: 0 };
  const entries = [];
  for (const target of targets || []) {
    const spec = String(target.spec ?? '');
    const parsed = splitSpec(spec);
    const name = parsed.name ?? (target.name ? String(target.name) : null);
    let status;
    if (target.local && !target.installable) status = 'local';
    else if (name && have.has(name)) {
      const current = have.get(name);
      if (parsed.version) status = String(current.version) === parsed.version ? 'same' : 'different';
      else if (NON_REGISTRY.test(spec) && current.source) status = String(current.source) === spec ? 'same' : 'different';
      else status = 'same';
    } else if (!name) {
      status = (installed || []).some((item) => item.source && String(item.source) === spec) ? 'same' : 'unknown';
    } else status = 'missing';
    statuses[status] += 1;
    entries.push({
      spec,
      name: name ?? String(target.name ?? ''),
      version: parsed.version,
      command: commandFor(spec, profile),
      status: status === 'same' ? 'installed-same' : status === 'different' ? 'installed-different' : status,
    });
  }
  return { entries, statuses };
}

export function renderReadme(manifest) {
  const lines = [
    `# ${manifest.name} ${manifest.version}`.trim(),
    '',
  ];
  if (manifest.description) lines.push(manifest.description, '');
  lines.push(
    '这是一个 DSH（DeepSeek Harness）整合包：只含插件清单与版本，不含插件代码、node_modules 或游戏本体。',
    '',
    `- 生成时间：${manifest.createdAt}`,
    `- 来源 profile：${manifest.profile ?? '（未知）'}`,
    `- DSH 版本：${manifest.dshVersion ?? '（未记录）'}`,
    `- 插件：${manifest.stats?.plugins ?? manifest.plugins.length} 个（可安装 ${manifest.stats?.installable ?? '?'} 个）`,
    '',
    '## 安装',
    '',
    '任选其一：',
    '',
    '1. 在 DSH 的 设置 → 整合包 → 导入 中选择本压缩包，预览后点“应用安装”。',
    '2. 逐条执行下面的命令（Windows PowerShell / macOS / Linux 均可）：',
    '',
    '```sh',
    ...(manifest.commands?.length ? manifest.commands : ['# 这个整合包没有可安装的插件']),
    '```',
    '',
  );
  const locals = manifest.plugins.filter((plugin) => plugin.local);
  if (locals.length) {
    lines.push(
      '## 需要手工处理的插件',
      '',
      '以下插件在导出机器上是本地链接（`link:` / 本地路径），没有可公开下载的地址，导入时会跳过：',
      '',
      ...locals.map((plugin) => `- \`${plugin.name}\` → ${plugin.spec}`),
      '',
    );
  }
  lines.push(
    '## 说明',
    '',
    '- 本包不包含任何插件代码或 token；导入时会按上面的 spec 从 npm / git 重新下载。',
    '- 如果导出时勾选了“包含配置”，配置里疑似密钥的字段会被替换为 ${REDACTED}（字面量），导入后需要重新填写。',
    '',
  );
  return lines.join('\n');
}

export function renderInstallScript(manifest, shell = 'sh') {
  const header =
    shell === 'ps1'
      ? `# ${manifest.name} ${manifest.version} —— DSH 整合包安装命令\n# 由 dsh-modpack 导出，只含插件引用，不含插件代码。\n`
      : `#!/usr/bin/env sh\n# ${manifest.name} ${manifest.version} —— DSH 整合包安装命令\n# 由 dsh-modpack 导出，只含插件引用，不含插件代码。\n`;
  return `${header}\n${(manifest.commands || []).join('\n')}\n`;
}
