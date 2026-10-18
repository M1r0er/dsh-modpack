/**
 * dsh-modpack —— Client 半（浏览器侧设置页）。
 *
 * 形态照 dsh-workspace-gate：单列、行式列表，每行 = 36px 图标块 + 标题(+标签)
 * + 一行灰描述；设置分组之间用发丝线分隔，不用卡片墙。
 *
 * 颜色**只用** `--dsw-alias-*` 主题 token，明暗主题自动跟随；几何值用数字。
 * 数据：Host 半在同源注册了 `/modpack/state|export|plan|import`，这里 fetch。
 * 文案全部走 locale 命名空间 `modpack`（zh 主 / en 备），locale 服务晚绑定；
 * `locale/*.json` 只放插件管理页展示用的 meta.title / meta.description。
 *
 * 模块级 inject 只能写 ['slots']，locale 走 ctx.inject 晚绑定。
 */
window.__ModuleLoader__.load({
  id: 'dsh-modpack',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'modpack';
    const API = '/modpack';

    const zh = {
      tab: '整合包',
      title: '整合包',
      lead: '像 PCL 整合包一样分享 DSH 插件：勾选要带的插件，导出一个只含清单与版本的小 zip 和一行行安装命令；导入时先预览、再应用。',
      statusLine: '{profile} · DSH {dsh} · 输出目录 {out}',
      statsLine: '{total} 个插件 · {installable} 个可分享 · {local} 个本机链接',
      refresh: '刷新',
      loading: '正在读取…',
      stateFailed: '读不到插件状态：',
      retry: '重试',
      exportTitle: '导出',
      exportLead: '只写插件名与版本，不打包插件代码；别人导入时按 npm 重新下载。',
      pluginsLabel: '插件',
      selectAll: '全选',
      invert: '反选',
      noPlugins: '当前 profile 里没有第三方插件。',
      localTag: '本机链接，不可分享',
      notShareable: '不可分享',
      disabledTag: '未启用',
      kindGit: 'git',
      kindTarball: 'tarball',
      kindUnknown: '未知来源',
      selectOne: '至少勾选一个可分享的插件。',
      fieldName: '名称',
      fieldVersion: '版本',
      fieldAuthor: '作者',
      fieldDescription: '描述',
      namePlaceholder: '我的整合包',
      descPlaceholder: '可选：这个包适合谁、装了什么',
      defaultName: 'DSH 整合包',
      includeConfig: '同时导出本机配置',
      includeConfigHint: '会把本机 configEditor 的覆盖项打进包里；可能含密钥，导出时默认剔除疑似密钥。',
      exportAction: '导出整合包',
      exporting: '正在导出…',
      exportFailed: '导出失败：',
      exportOk: '导出完成',
      exportNoArchive: '这次只生成了命令，没有写 zip 文件。',
      fileLabel: '文件',
      sizeLabel: '大小',
      copy: '复制',
      copied: '已复制',
      copyFailed: '复制失败',
      commandTitle: '一键安装命令',
      commandHint: '把这串命令贴进终端，就能按锁定版本安装。',
      copyCommand: '复制命令',
      selectCommands: '全选命令',
      warnings: '提示',
      importTitle: '导入',
      importLead: '拖入 .dshpack.zip，或粘贴安装命令串；先预览每一条的状态，再决定是否应用。',
      dropHere: '把整合包拖到这里',
      acceptHint: '支持 .dshpack.zip / .zip / .dshpack',
      chooseFile: '选择文件',
      pasteTitle: '或粘贴命令串',
      pastePlaceholder: 'dsh plugin --profile desktop add dsh-better-sidebar@0.28.0\n# 每行一条；# 开头是注释',
      previewAction: '预览',
      previewing: '正在预览…',
      clear: '清空',
      planFailed: '预览失败：',
      fileReadFailed: '读取文件失败：',
      needText: '先粘贴命令串再预览。',
      unnamed: '（未命名）',
      sourceArchive: '来自文件',
      sourceCommands: '来自命令串',
      planName: '整合包',
      statusSame: '已装同版本',
      statusDifferent: '已装不同版本',
      statusMissing: '未安装',
      statusLocal: '本机链接',
      statusUnknown: '未知状态',
      planStats: '同版本 {same} · 版本不同 {different} · 未安装 {missing} · 本机 {local} · 未知 {unknown}',
      configCount: '包内含 {n} 条配置覆盖',
      withConfig: '应用包内配置',
      withConfigHint: '默认只装插件；勾选后才会写入包内的 configEditor 覆盖项。',
      noPlanHint: '预览成功后，这里会列出每一条与它的状态。',
      applyAction: '应用安装',
      applyConfirmHint: '即将按清单处理 {n} 个插件，并先写一份可回滚的还原点；这会改动本机 profile。',
      applyConfirm: '确认安装',
      cancel: '取消',
      applying: '正在安装…',
      applyFailed: '安装失败：',
      applied: '安装完成',
      applyNothing: '没有执行变更。',
      backup: '还原点',
      restartRequired: '部分改动要重启 DSH 才会全部生效。',
      results: '逐条结果',
      actionInstalled: '已安装',
      actionSkipped: '已跳过',
      actionFailed: '失败',
      reasonLabel: '原因',
      emptyResults: '没有需要变更的插件。',
      crashTitle: '设置页渲染出错',
      crashHint: '请关闭设置再打开；细节见控制台。',
      unknownValue: '—',
    };

    const en = {
      tab: 'Modpack',
      title: 'Modpacks',
      lead: 'Share DSH plugins the way PCL modpacks work: tick what to include, export a small zip that carries only the manifest and versions plus one install command per plugin; on import, preview every entry before applying.',
      statusLine: '{profile} · DSH {dsh} · output {out}',
      statsLine: '{total} plugins · {installable} shareable · {local} local links',
      refresh: 'Refresh',
      loading: 'Reading…',
      stateFailed: 'Cannot read plugin state: ',
      retry: 'Retry',
      exportTitle: 'Export',
      exportLead: 'The archive records names and versions only, never plugin code; importers re-download from npm.',
      pluginsLabel: 'Plugins',
      selectAll: 'Select all',
      invert: 'Invert',
      noPlugins: 'This profile has no third-party plugins.',
      localTag: 'local link, cannot be shared',
      notShareable: 'cannot be shared',
      disabledTag: 'disabled',
      kindGit: 'git',
      kindTarball: 'tarball',
      kindUnknown: 'unknown source',
      selectOne: 'Select at least one shareable plugin.',
      fieldName: 'Name',
      fieldVersion: 'Version',
      fieldAuthor: 'Author',
      fieldDescription: 'Description',
      namePlaceholder: 'My modpack',
      descPlaceholder: 'Optional: who this pack is for, what it installs',
      defaultName: 'DSH Modpack',
      includeConfig: 'Also export local config',
      includeConfigHint: 'Bundles configEditor overrides from this machine; they may contain secrets, so suspected secrets are stripped by default.',
      exportAction: 'Export modpack',
      exporting: 'Exporting…',
      exportFailed: 'Export failed: ',
      exportOk: 'Export finished',
      exportNoArchive: 'Only commands were generated; no zip file was written.',
      fileLabel: 'File',
      sizeLabel: 'Size',
      copy: 'Copy',
      copied: 'Copied',
      copyFailed: 'Copy failed',
      commandTitle: 'Install commands',
      commandHint: 'Paste these into a terminal to install the pinned versions.',
      copyCommand: 'Copy commands',
      selectCommands: 'Select commands',
      warnings: 'Notes',
      importTitle: 'Import',
      importLead: 'Drop a .dshpack.zip or paste an install command string; preview each entry and its status before applying.',
      dropHere: 'Drop a modpack here',
      acceptHint: 'Accepts .dshpack.zip / .zip / .dshpack',
      chooseFile: 'Choose file',
      pasteTitle: 'or paste install commands',
      pastePlaceholder: 'dsh plugin --profile desktop add dsh-better-sidebar@0.28.0\n# one per line; lines starting with # are comments',
      previewAction: 'Preview',
      previewing: 'Previewing…',
      clear: 'Clear',
      planFailed: 'Preview failed: ',
      fileReadFailed: 'Cannot read file: ',
      needText: 'Paste commands before previewing.',
      unnamed: '(unnamed)',
      sourceArchive: 'from archive',
      sourceCommands: 'from commands',
      planName: 'Modpack',
      statusSame: 'same version installed',
      statusDifferent: 'different version installed',
      statusMissing: 'not installed',
      statusLocal: 'local link',
      statusUnknown: 'unknown',
      planStats: 'same {same} · different {different} · missing {missing} · local {local} · unknown {unknown}',
      configCount: '{n} config overrides in pack',
      withConfig: 'Apply bundled config',
      withConfigHint: 'Only plugins are installed by default; tick to write the pack’s configEditor overrides too.',
      noPlanHint: 'After a successful preview, every entry and its status appears here.',
      applyAction: 'Apply install',
      applyConfirmHint: 'About to process {n} plugin entries and write a rollback point first; this changes this machine’s profile.',
      applyConfirm: 'Confirm install',
      cancel: 'Cancel',
      applying: 'Installing…',
      applyFailed: 'Install failed: ',
      applied: 'Install finished',
      applyNothing: 'Nothing had to change.',
      backup: 'Rollback point',
      restartRequired: 'Some changes take effect only after restarting DSH.',
      results: 'Per-entry results',
      actionInstalled: 'installed',
      actionSkipped: 'skipped',
      actionFailed: 'failed',
      reasonLabel: 'reason',
      emptyResults: 'No plugin needed a change.',
      crashTitle: 'This settings page failed to render',
      crashHint: 'Close settings and open it again; see the console for details.',
      unknownValue: '—',
    };

    // cordis 服务晚绑定：模块级 inject 不能写 locale，只能按需取。
    function safeGet(ctx, service) {
      try {
        return ctx.get(service);
      } catch (error) {
        return undefined;
      }
    }

    // 颜色全部走主题 token；几何值用数字
    const T = {
      bg1: 'var(--dsw-alias-bg-layer-1)',
      bg2: 'var(--dsw-alias-bg-layer-2)',
      bg3: 'var(--dsw-alias-bg-layer-3)',
      border1: 'var(--dsw-alias-border-l1)',
      border2: 'var(--dsw-alias-border-l2)',
      brand: 'var(--dsw-alias-brand-primary)',
      label: 'var(--dsw-alias-label-primary)',
      labelInvert: 'var(--dsw-alias-label-primary-foreground)',
      muted: 'var(--dsw-alias-label-secondary)',
      dimmed: 'var(--dsw-alias-label-tertiary)',
      hover: 'var(--dsw-alias-interactive-bg-hover)',
      error: 'var(--dsw-alias-label-error)',
      success: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-label)',
      codeBg: 'var(--dsw-alias-markdown-code-block)',
    };

    const S = {
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
      title: { fontSize: 14, fontWeight: 600, color: T.label, lineHeight: '20px' },
      sectionTitle: { fontSize: 13, fontWeight: 600, color: T.label, lineHeight: '20px' },
      lead: { fontSize: 12, color: T.muted, lineHeight: '18px' },
      desc: {
        fontSize: 12,
        color: T.muted,
        lineHeight: '18px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      hint: { fontSize: 11, color: T.dimmed, lineHeight: '17px' },
      ghost: {
        border: 'none',
        background: 'transparent',
        color: T.muted,
        borderRadius: 7,
        padding: '4px 8px',
        fontSize: 12,
        lineHeight: '18px',
        cursor: 'pointer',
      },
      outline: {
        border: `1px solid ${T.border2}`,
        background: 'transparent',
        color: T.label,
        borderRadius: 7,
        padding: '4px 10px',
        fontSize: 12,
        lineHeight: '18px',
        cursor: 'pointer',
      },
      primary: {
        border: `1px solid ${T.brand}`,
        background: T.brand,
        color: T.labelInvert,
        borderRadius: 8,
        padding: '6px 16px',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: '18px',
        cursor: 'pointer',
      },
      input: {
        boxSizing: 'border-box',
        color: T.label,
        background: T.bg1,
        border: `1px solid ${T.border1}`,
        borderRadius: 8,
        padding: '5px 10px',
        fontSize: 12,
        lineHeight: '18px',
        outline: 'none',
      },
      textarea: {
        boxSizing: 'border-box',
        color: T.label,
        background: T.bg1,
        border: `1px solid ${T.border1}`,
        borderRadius: 8,
        padding: '7px 10px',
        fontSize: 12,
        lineHeight: '18px',
        outline: 'none',
        resize: 'vertical',
        minHeight: 78,
        width: '100%',
      },
      pre: {
        margin: 0,
        padding: '8px 10px',
        borderRadius: 8,
        border: `1px solid ${T.border1}`,
        background: T.codeBg,
        color: T.label,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 11,
        lineHeight: '18px',
        whiteSpace: 'pre',
        overflowX: 'auto',
        userSelect: 'text',
      },
      tag: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0 6px',
        height: 18,
        borderRadius: 5,
        fontSize: 11,
        lineHeight: '18px',
        color: T.muted,
        background: T.bg2,
        whiteSpace: 'nowrap',
      },
      icon: {
        flex: '0 0 auto',
        width: 36,
        height: 36,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: T.bg2,
        color: T.muted,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.2,
      },
    };

    function monogram(label) {
      const s = String(label || '').trim();
      if (!s) return '·';
      if (/[\u3400-\u9fff]/.test(s[0])) return s.slice(0, 2);
      const parts = s.split(/[^A-Za-z0-9]+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return s.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '·';
    }

    function isInstallable(plugin) {
      if (!plugin || typeof plugin.name !== 'string' || !plugin.name) return false;
      if (plugin.installable === false) return false;
      if (plugin.local === true) return false;
      return true;
    }

    function formatBytes(value) {
      const n = Number(value);
      if (!isFinite(n) || n < 0) return '';
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / 1024 / 1024).toFixed(1)} MB`;
    }

    function interpolate(template, params) {
      let text = String(template);
      if (!params) return text;
      for (const name of Object.keys(params)) {
        text = text.split(`{${name}}`).join(String(params[name]));
      }
      return text;
    }

    function safeMessage(cause) {
      if (!cause) return 'unknown error';
      if (typeof cause === 'string') return cause;
      if (cause.message) return String(cause.message);
      return String(cause);
    }

    /** 复制到剪贴板；没有剪贴板 API 或权限被拒时 reject，由调用方显示失败。 */
    function copyText(text) {
      const value = String(text === undefined || text === null ? '' : text);
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(value);
      }
      return Promise.reject(new Error('clipboard unavailable'));
    }

    /** 同源 JSON 请求；非 2xx 或 ok:false 都变成带可读 error 的 rejection。 */
    function fetchJson(path, options) {
      return fetch(`${API}${path}`, options).then((res) =>
        res
          .json()
          .catch(() => ({}))
          .then((body) => {
            if (!res.ok) throw new Error((body && body.error) || `HTTP ${res.status}`);
            if (body && body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
            return body;
          }),
      );
    }

    function getState() {
      return fetchJson('/state');
    }

    function postJson(path, body) {
      return fetchJson(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
    }

    function readFileBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read failed'));
        reader.onload = () => {
          const text = String(reader.result || '');
          const comma = text.indexOf(',');
          resolve(comma >= 0 ? text.slice(comma + 1) : text);
        };
        reader.readAsDataURL(file);
      });
    }

    const STATUS_KEYS = {
      'installed-same': 'statusSame',
      'installed-different': 'statusDifferent',
      missing: 'statusMissing',
      local: 'statusLocal',
      unknown: 'statusUnknown',
    };

    const STATUS_TONES = {
      'installed-same': T.success,
      'installed-different': T.warn,
      missing: T.muted,
      local: T.dimmed,
      unknown: T.error,
    };

    const ACTION_KEYS = {
      installed: 'actionInstalled',
      skipped: 'actionSkipped',
      failed: 'actionFailed',
    };

    function buildPanel(ctx, t) {
      function useLocaleRevision() {
        const [, setTick] = React.useState(0);
        React.useEffect(() => {
          const locale = safeGet(ctx, 'locale');
          if (!locale || typeof locale.subscribe !== 'function') return undefined;
          return locale.subscribe(() => setTick((n) => n + 1));
        }, []);
      }

      // 渲染兜底：组件抛错时不至于把整个 slot 入口打空。
      class Boundary extends React.Component {
        constructor(props) {
          super(props);
          this.state = { error: null };
        }
        static getDerivedStateFromError(error) {
          return { error };
        }
        componentDidCatch(error) {
          console.error('[modpack] settings page crashed:', error);
        }
        render() {
          if (this.state.error) {
            return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, padding: '16px 0' } }, [
              h('div', { key: 'a', style: { fontSize: 13, color: T.error } }, t('crashTitle')),
              h('div', { key: 'b', style: S.hint }, t('crashHint')),
            ]);
          }
          return this.props.children;
        }
      }

      return function Panel() {
        useLocaleRevision();

        const [snapshot, setSnapshot] = React.useState(null);
        const [loadError, setLoadError] = React.useState(null);
        const [refreshing, setRefreshing] = React.useState(false);

        const [selected, setSelected] = React.useState(null);
        const [form, setForm] = React.useState({
          name: '',
          version: '1.0.0',
          author: '',
          description: '',
          includeConfig: false,
        });
        const initialized = React.useRef(false);

        const [exporting, setExporting] = React.useState(false);
        const [exportResult, setExportResult] = React.useState(null);
        const [exportError, setExportError] = React.useState(null);
        const commandsRef = React.useRef(null);

        const [planText, setPlanText] = React.useState('');
        const [plan, setPlan] = React.useState(null);
        const [planSource, setPlanSource] = React.useState(null);
        const [planning, setPlanning] = React.useState(false);
        const [planError, setPlanError] = React.useState(null);
        const [fileName, setFileName] = React.useState('');
        const [dragOver, setDragOver] = React.useState(false);
        const [withConfig, setWithConfig] = React.useState(false);
        const [confirming, setConfirming] = React.useState(false);
        const [applying, setApplying] = React.useState(false);
        const [applyResult, setApplyResult] = React.useState(null);
        const [applyError, setApplyError] = React.useState(null);

        const [copyFeedback, setCopyFeedback] = React.useState(null);
        const copyTimer = React.useRef(null);
        const fileInput = React.useRef(null);

        React.useEffect(
          () => () => {
            if (copyTimer.current) clearTimeout(copyTimer.current);
          },
          [],
        );

        const loadState = React.useCallback(() => {
          setRefreshing(true);
          setLoadError(null);
          return getState()
            .then((data) => {
              setSnapshot(data);
            })
            .catch((cause) => {
              setLoadError(safeMessage(cause));
            })
            .then(() => {
              setRefreshing(false);
            });
        }, []);

        React.useEffect(() => {
          loadState();
        }, [loadState]);

        React.useEffect(() => {
          if (!snapshot || initialized.current) return;
          initialized.current = true;
          const names = [];
          const plugins = Array.isArray(snapshot.plugins) ? snapshot.plugins : [];
          for (const plugin of plugins) if (isInstallable(plugin)) names.push(plugin.name);
          setSelected(names);
          setForm((prev) =>
            prev.name ? prev : Object.assign({}, prev, { name: t('defaultName') }),
          );
        }, [snapshot]);

        const feedback = (kind, ok) => {
          if (copyTimer.current) clearTimeout(copyTimer.current);
          setCopyFeedback({ kind, ok });
          copyTimer.current = setTimeout(() => setCopyFeedback(null), 1600);
        };

        const handleCopy = (kind, text) => {
          copyText(text)
            .then(() => feedback(kind, true))
            .catch(() => feedback(kind, false));
        };

        const selectAllCommands = () => {
          const node = commandsRef.current;
          if (!node || typeof window === 'undefined' || typeof window.getSelection !== 'function') {
            handleCopy('command', commandText);
            return;
          }
          try {
            const range = document.createRange();
            range.selectNodeContents(node);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
          } catch (error) {
            handleCopy('command', commandText);
          }
        };

        const plugins = snapshot && Array.isArray(snapshot.plugins) ? snapshot.plugins : [];
        const selectedSet = React.useMemo(() => new Set(selected || []), [selected]);
        const installableNames = React.useMemo(
          () => plugins.filter((plugin) => isInstallable(plugin)).map((plugin) => plugin.name),
          [plugins],
        );
        const selectedNames = installableNames.filter((name) => selectedSet.has(name));
        const exportResultPath = exportResult && exportResult.path ? String(exportResult.path) : '';
        const commandText = exportResult && exportResult.commandText ? String(exportResult.commandText) : '';
        const exportCommands =
          exportResult && Array.isArray(exportResult.commands) ? exportResult.commands.filter(Boolean) : [];

        const stats = React.useMemo(() => {
          if (snapshot && snapshot.stats && typeof snapshot.stats.total === 'number') return snapshot.stats;
          return {
            total: plugins.length,
            installable: plugins.filter((plugin) => isInstallable(plugin)).length,
            local: plugins.filter((plugin) => plugin.local === true).length,
          };
        }, [snapshot, plugins]);

        const togglePlugin = (name, on) => {
          setSelected((prev) => {
            const next = new Set(prev || []);
            if (on) next.add(name);
            else next.delete(name);
            return installableNames.filter((candidate) => next.has(candidate));
          });
        };

        const doExport = () => {
          if (exporting || !snapshot) return;
          if (!selectedNames.length) {
            setExportResult(null);
            setExportError(t('selectOne'));
            return;
          }
          setExporting(true);
          setExportError(null);
          setExportResult(null);
          const body = {
            name: form.name.trim(),
            version: form.version.trim(),
            author: form.author.trim(),
            description: form.description.trim(),
            include: selectedNames,
            includeConfig: form.includeConfig === true,
            redactSecrets: true,
          };
          if (snapshot.profile) body.profile = snapshot.profile;
          postJson('/export', body)
            .then((data) => setExportResult(data))
            .catch((cause) => setExportError(safeMessage(cause)))
            .then(() => setExporting(false));
        };

        const previewPlan = (source) => {
          if (planning || applying || !source) return;
          setPlanning(true);
          setPlanError(null);
          setApplyError(null);
          setApplyResult(null);
          setConfirming(false);
          const body = source.kind === 'pack' ? { pack: source.pack } : { text: source.text };
          postJson('/plan', body)
            .then((data) => {
              setPlan(data);
              setPlanSource(source);
              setWithConfig(false);
            })
            .catch((cause) => {
              setPlan(null);
              setPlanSource(null);
              setPlanError(t('planFailed') + safeMessage(cause));
            })
            .then(() => setPlanning(false));
        };

        const onFile = (file) => {
          if (!file || planning || applying) return;
          setFileName(file.name || '');
          setPlanError(null);
          readFileBase64(file)
            .then((base64) => previewPlan({ kind: 'pack', pack: base64 }))
            .catch((cause) => {
              setPlan(null);
              setPlanSource(null);
              setPlanError(t('fileReadFailed') + safeMessage(cause));
            });
        };

        const onDrop = (event) => {
          event.preventDefault();
          setDragOver(false);
          const list = event.dataTransfer && event.dataTransfer.files;
          if (list && list.length) onFile(list[0]);
        };

        const previewText = () => {
          const text = planText.trim();
          if (!text) {
            setPlanError(t('needText'));
            return;
          }          previewPlan({ kind: 'text', text });
        };

        const clearPlan = () => {
          if (planning || applying) return;
          setPlan(null);
          setPlanSource(null);
          setPlanText('');
          setFileName('');
          setPlanError(null);
          setApplyResult(null);
          setApplyError(null);
          setWithConfig(false);
          setConfirming(false);
          if (fileInput.current) fileInput.current.value = '';
        };

        const doApply = () => {
          if (!plan || !planSource || planning || applying) return;
          setApplying(true);
          setApplyError(null);
          setApplyResult(null);
          const body = { apply: true };
          if (planSource.kind === 'pack') body.pack = planSource.pack;
          else body.text = planSource.text;
          if (withConfig && plan.configCount) body.withConfig = true;
          postJson('/import', body)
            .then((data) => {
              setApplyResult(data);
              if (data && data.plan) setPlan(data.plan);
              setConfirming(false);
              loadState();
            })
            .catch((cause) => setApplyError(safeMessage(cause)))
            .then(() => setApplying(false));
        };

        if (!snapshot) {
          if (loadError) {
            return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '20px 0' } }, [
              h('div', { key: 'e', style: { fontSize: 13, color: T.error } }, t('stateFailed') + loadError),
              h(
                'button',
                {
                  key: 'r',
                  type: 'button',
                  style: Object.assign({}, S.outline, { alignSelf: 'flex-start' }),
                  onClick: loadState,
                },
                t('retry'),
              ),
            ]);
          }
          return h('div', { style: { padding: '20px 0', fontSize: 13, color: T.muted } }, t('loading'));
        }

        const profileText = snapshot.profile ? String(snapshot.profile) : t('unknownValue');
        const dshText = snapshot.dshVersion ? String(snapshot.dshVersion) : t('unknownValue');
        const outText = snapshot.outDir ? String(snapshot.outDir) : t('unknownValue');
        const notes = Array.isArray(snapshot.notes) ? snapshot.notes.filter(Boolean) : [];

        const tag = (key, text, tone) =>
          h('span', { key, style: Object.assign({}, S.tag, tone ? { color: tone } : {}) }, text);

        const pluginRow = (plugin) => {
          const name = String(plugin.name);
          const shareable = isInstallable(plugin);
          const checked = shareable && selectedSet.has(name);
          const kindTag =
            plugin.kind && plugin.kind !== 'registry' && plugin.kind !== 'local'
              ? t(plugin.kind === 'git' ? 'kindGit' : plugin.kind === 'tarball' ? 'kindTarball' : 'kindUnknown')
              : '';
          const version = plugin.version ? String(plugin.version) : '';
          const description = plugin.description ? String(plugin.description) : name;
          const tags = [];
          if (version) tags.push(tag('v', version, T.brand));
          if (kindTag) tags.push(tag('k', kindTag));
          if (plugin.local === true) tags.push(tag('l', t('localTag'), T.warn));
          else if (plugin.installable === false) tags.push(tag('n', t('notShareable'), T.warn));
          if (plugin.enabled === false) tags.push(tag('d', t('disabledTag')));

          return h(
            'label',
            {
              key: name,
              title: description,
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '7px 10px',
                borderRadius: 8,
                cursor: shareable ? 'pointer' : 'default',
                opacity: shareable ? 1 : 0.55,
              },
              onMouseEnter: (event) => {
                if (shareable) event.currentTarget.style.background = T.hover;
              },
              onMouseLeave: (event) => {
                event.currentTarget.style.background = 'transparent';
              },
            },
            [
              h('div', { key: 'i', style: S.icon }, monogram(name)),
              h(
                'div',
                {
                  key: 't',
                  style: { flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 },
                },
                [
                  h('div', { key: 'l1', style: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 } }, [
                    h(
                      'span',
                      {
                        key: 'n',
                        style: Object.assign({}, S.title, {
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }),
                      },
                      name,
                    ),
                    ...tags,
                  ]),
                  h('div', { key: 'l2', style: S.desc }, description),
                ],
              ),
              h('input', {
                key: 'c',
                type: 'checkbox',
                checked: checked,
                disabled: !shareable || exporting,
                'aria-label': name,
                onChange: (event) => togglePlugin(name, event.target.checked === true),
                style: {
                  accentColor: T.brand,
                  width: 15,
                  height: 15,
                  margin: 0,
                  flex: '0 0 auto',
                  cursor: shareable ? 'pointer' : 'default',
                },
              }),
            ],
          );
        };

        const field = (key, label, control) =>
          h(
            'div',
            { key, style: { display: 'flex', alignItems: 'center', gap: 10 } },
            [h('span', { key: 'l', style: { flex: '0 0 auto', width: 76, fontSize: 12, color: T.muted } }, label), control],
          );

        const input = (key, value, placeholder, onChange) =>
          h('input', {
            key,
            type: 'text',
            value,
            placeholder,
            spellCheck: false,
            onChange: (event) => onChange(event.target.value),
            style: Object.assign({}, S.input, { flex: '1 1 auto', minWidth: 0 }),
          });

        const sectionHead = (key, title, extra) =>
          h(
            'div',
            {
              key,
              style: {
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                paddingTop: 14,
                marginTop: 4,
                borderTop: `1px solid ${T.border1}`,
              },
            },
            [h('span', { key: 't', style: S.sectionTitle }, title), extra || h('span', { key: 'x' })],
          );

        // ── 导出区
        const pluginList = plugins.length
          ? plugins.map(pluginRow)
          : [h('div', { key: 'none', style: { padding: '12px 2px', fontSize: 12, color: T.muted } }, t('noPlugins'))];

        const exportResultBlock = exportResult
          ? h('div', { key: 'result', style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 } }, [
              h(
                'div',
                { key: 'head', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
                [
                  h('span', { key: 'ok', style: { fontSize: 12, color: T.success } }, t('exportOk')),
                  exportResult.bytes || exportResult.bytes === 0
                    ? h('span', { key: 'size', style: S.hint }, `${t('sizeLabel')}: ${formatBytes(exportResult.bytes)}`)
                    : null,
                ],
              ),
              exportResultPath
                ? h('div', { key: 'path', style: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 } }, [
                    h('span', { key: 'lb', style: { fontSize: 12, color: T.muted, flex: '0 0 auto' } }, t('fileLabel')),
                    h(
                      'code',
                      {
                        key: 'p',
                        style: Object.assign({}, S.mono, {
                          fontSize: 11,
                          color: T.label,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: '1 1 auto',
                          minWidth: 0,
                        }),
                      },
                      exportResultPath,
                    ),
                    h(
                      'button',
                      { key: 'c', type: 'button', style: S.ghost, onClick: () => handleCopy('path', exportResultPath) },
                      copyFeedback && copyFeedback.kind === 'path' && copyFeedback.ok ? t('copied') : t('copy'),
                    ),
                  ])
                : h('div', { key: 'nozip', style: S.hint }, t('exportNoArchive')),
              Array.isArray(exportResult.warnings) && exportResult.warnings.length
                ? h(
                    'div',
                    { key: 'warn', style: { display: 'flex', flexDirection: 'column', gap: 2 } },
                    [h('div', { key: 'h', style: S.hint }, t('warnings'))].concat(
                      exportResult.warnings.filter(Boolean).map((line, index) =>
                        h('div', { key: `w${index}`, style: Object.assign({}, S.hint, { color: T.warn }) }, String(line)),
                      ),
                    ),
                  )
                : null,
              commandText
                ? h('div', { key: 'cmd', style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 } }, [
                    h('div', { key: 'h', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, [
                      h('span', { key: 't', style: { fontSize: 12, color: T.label } }, t('commandTitle')),
                      h('span', { key: 'hint', style: S.hint }, t('commandHint')),
                      h(
                        'button',
                        { key: 'copy', type: 'button', style: S.ghost, onClick: () => handleCopy('command', commandText) },
                        copyFeedback && copyFeedback.kind === 'command' && copyFeedback.ok ? t('copied') : t('copyCommand'),
                      ),
                      h('button', { key: 'sel', type: 'button', style: S.ghost, onClick: selectAllCommands }, t('selectCommands')),
                      copyFeedback && copyFeedback.kind === 'command' && !copyFeedback.ok
                        ? h('span', { key: 'cf', style: Object.assign({}, S.hint, { color: T.error }) }, t('copyFailed'))
                        : null,
                    ]),
                    h('pre', { key: 'pre', ref: commandsRef, style: S.pre }, commandText || exportCommands.join('\n')),
                  ])
                : null,
            ])
          : null;

        const exportBlock = h('div', { key: 'export', style: { display: 'flex', flexDirection: 'column', gap: 8 } }, [
          sectionHead('export-head', t('exportTitle')),
          h('div', { key: 'lead', style: S.lead }, t('exportLead')),
          h('div', { key: 'plugins-head', style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 } }, [
            h('span', { key: 'l', style: { fontSize: 12, color: T.muted } }, t('pluginsLabel')),
            h('span', { key: 'c', style: S.hint }, `${selectedNames.length}/${installableNames.length}`),
            h('span', { key: 'sp', style: { marginLeft: 'auto' } }),
            h(
              'button',
              {
                key: 'all',
                type: 'button',
                style: S.ghost,
                disabled: exporting || selectedNames.length === installableNames.length,
                onClick: () => setSelected(installableNames.slice()),
              },
              t('selectAll'),
            ),
            h(
              'button',
              {
                key: 'inv',
                type: 'button',
                style: S.ghost,
                disabled: exporting,
                onClick: () =>
                  setSelected(installableNames.filter((name) => !selectedSet.has(name))),
              },
              t('invert'),
            ),
          ]),
          h('div', { key: 'list', style: { display: 'flex', flexDirection: 'column' } }, pluginList),
          h('div', { key: 'fields', style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 } }, [
            field(
              'name',
              t('fieldName'),
              input('name', form.name, t('namePlaceholder'), (value) =>
                setForm((prev) => Object.assign({}, prev, { name: value })),
              ),
            ),
            field(
              'version',
              t('fieldVersion'),
              input('version', form.version, '1.0.0', (value) =>
                setForm((prev) => Object.assign({}, prev, { version: value })),
              ),
            ),
            field(
              'author',
              t('fieldAuthor'),
              input('author', form.author, '', (value) =>
                setForm((prev) => Object.assign({}, prev, { author: value })),
              ),
            ),
            field(
              'description',
              t('fieldDescription'),
              h('input', {
                key: 'd',
                type: 'text',
                value: form.description,
                placeholder: t('descPlaceholder'),
                spellCheck: false,
                onChange: (event) =>
                  setForm((prev) => Object.assign({}, prev, { description: event.target.value })),
                style: Object.assign({}, S.input, { flex: '1 1 auto', minWidth: 0 }),
              }),
            ),
          ]),
          h('div', { key: 'cfg', style: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 } }, [
            h(
              'label',
              { key: 'row', style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: T.label } },
              [
                h('input', {
                  key: 'i',
                  type: 'checkbox',
                  checked: form.includeConfig === true,
                  onChange: (event) =>
                    setForm((prev) => Object.assign({}, prev, { includeConfig: event.target.checked === true })),
                  style: { accentColor: T.brand, width: 15, height: 15, margin: 0, cursor: 'pointer' },
                }),
                h('span', { key: 'l' }, t('includeConfig')),
              ],
            ),
            h('div', { key: 'hint', style: Object.assign({}, S.hint, { paddingLeft: 23 }) }, t('includeConfigHint')),
          ]),
          h('div', { key: 'actions', style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' } }, [
            h(
              'button',
              {
                key: 'go',
                type: 'button',
                disabled: exporting || !selectedNames.length,
                onClick: doExport,
                style: Object.assign({}, S.primary, {
                  opacity: exporting || !selectedNames.length ? 0.5 : 1,
                  cursor: exporting || !selectedNames.length ? 'default' : 'pointer',
                }),
              },
              exporting ? t('exporting') : t('exportAction'),
            ),
            installableNames.length && !selectedNames.length
              ? h('span', { key: 'h', style: S.hint }, t('selectOne'))
              : null,
            exportError
              ? h('span', { key: 'e', style: { fontSize: 11, color: T.error } }, t('exportFailed') + exportError)
              : null,
          ]),
          exportResultBlock,
        ]);

        // ── 导入区
        const statusChip = (key, status) => {
          const statusKey = STATUS_KEYS[status];
          return h(
            'span',
            { key, style: Object.assign({}, S.tag, { color: STATUS_TONES[status] || T.muted }) },
            statusKey ? t(statusKey) : String(status || t('statusUnknown')),
          );
        };

        const planCommands = plan && Array.isArray(plan.commands) ? plan.commands : [];
        const planStatuses = plan && plan.statuses ? plan.statuses : {};
        const planStatsText = plan
          ? t('planStats', {
              same: Number(planStatuses.same) || 0,
              different: Number(planStatuses.different) || 0,
              missing: Number(planStatuses.missing) || 0,
              local: Number(planStatuses.local) || 0,
              unknown: Number(planStatuses.unknown) || 0,
            })
          : '';
        const planConfigCount = plan ? Number(plan.configCount) || 0 : 0;
        const planWarnings = plan && Array.isArray(plan.warnings) ? plan.warnings.filter(Boolean) : [];

        const planBlock = plan
          ? h('div', { key: 'plan', style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 } }, [
              h('div', { key: 'head', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, [
                h('span', { key: 'n', style: S.title }, plan.name ? String(plan.name) : t('unnamed')),
                tag('src', plan.source === 'archive' ? t('sourceArchive') : t('sourceCommands')),
                plan.source === 'archive' && fileName ? tag('file', fileName) : null,
                planConfigCount ? tag('cfg', t('configCount', { n: planConfigCount }), T.warn) : null,
                h('span', { key: 'sp', style: { marginLeft: 'auto' } }),
                h('button', { key: 'clear', type: 'button', style: S.ghost, disabled: planning || applying, onClick: clearPlan }, t('clear')),
              ]),
              h('div', { key: 'stats', style: S.hint }, planStatsText),
              h(
                'div',
                { key: 'list', style: { display: 'flex', flexDirection: 'column' } },
                planCommands.length
                  ? planCommands.map((entry, index) =>
                      h(
                        'div',
                        {
                          key: `${entry && entry.spec ? entry.spec : 'entry'}-${index}`,
                          title: entry && entry.command ? String(entry.command) : '',
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '4px 10px',
                            borderRadius: 7,
                            fontSize: 12,
                          },
                          onMouseEnter: (event) => {
                            event.currentTarget.style.background = T.hover;
                          },
                          onMouseLeave: (event) => {
                            event.currentTarget.style.background = 'transparent';
                          },
                        },
                        [
                          h(
                            'span',
                            {
                              key: 's',
                              style: Object.assign({}, S.mono, {
                                fontSize: 11,
                                color: T.label,
                                flex: '1 1 auto',
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }),
                            },
                            entry && entry.spec ? String(entry.spec) : '—',
                          ),
                          statusChip('st', entry && entry.status),
                        ],
                      ),
                    )
                  : [h('div', { key: 'none', style: Object.assign({}, S.hint, { padding: '6px 10px' }) }, t('noPlanHint'))],
              ),
              planWarnings.length
                ? h(
                    'div',
                    { key: 'warn', style: { display: 'flex', flexDirection: 'column', gap: 2 } },
                    [h('div', { key: 'h', style: S.hint }, t('warnings'))].concat(
                      planWarnings.map((line, index) =>
                        h('div', { key: `w${index}`, style: Object.assign({}, S.hint, { color: T.warn }) }, String(line)),
                      ),
                    ),
                  )
                : null,
              planConfigCount
                ? h('div', { key: 'withcfg', style: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 } }, [
                    h(
                      'label',
                      { key: 'row', style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: T.label } },
                      [
                        h('input', {
                          key: 'i',
                          type: 'checkbox',
                          checked: withConfig === true,
                          disabled: applying,
                          onChange: (event) => setWithConfig(event.target.checked === true),
                          style: { accentColor: T.brand, width: 15, height: 15, margin: 0, cursor: 'pointer' },
                        }),
                        h('span', { key: 'l' }, t('withConfig')),
                      ],
                    ),
                    h('div', { key: 'h', style: Object.assign({}, S.hint, { paddingLeft: 23 }) }, t('withConfigHint')),
                  ])
                : null,
              confirming
                ? h(
                    'div',
                    {
                      key: 'confirm',
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        marginTop: 4,
                        borderRadius: 8,
                        border: `1px solid ${T.border2}`,
                        background: T.bg1,
                        flexWrap: 'wrap',
                      },
                    },
                    [
                      h(
                        'span',
                        { key: 'h', style: { flex: '1 1 240px', minWidth: 0, fontSize: 11, color: T.warn, lineHeight: '17px' } },
                        t('applyConfirmHint', { n: planCommands.length }),
                      ),
                      h(
                        'button',
                        {
                          key: 'go',
                          type: 'button',
                          disabled: applying,
                          onClick: doApply,
                          style: Object.assign({}, S.primary, { opacity: applying ? 0.5 : 1, cursor: applying ? 'default' : 'pointer' }),
                        },
                        applying ? t('applying') : t('applyConfirm'),
                      ),
                      h('button', { key: 'no', type: 'button', style: S.ghost, disabled: applying, onClick: () => setConfirming(false) }, t('cancel')),
                    ],
                  )
                : h(
                    'div',
                    { key: 'actions', style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' } }, 
                    [
                      h(
                        'button',
                        {
                          key: 'apply',
                          type: 'button',
                          disabled: applying || planning,
                          onClick: () => setConfirming(true),
                          style: Object.assign({}, S.primary, {
                            opacity: applying || planning ? 0.5 : 1,
                            cursor: applying || planning ? 'default' : 'pointer',
                          }),
                        },
                        applying ? t('applying') : t('applyAction'),
                      ),
                      applyError
                        ? h('span', { key: 'e', style: { fontSize: 11, color: T.error } }, t('applyFailed') + applyError)
                        : null,
                    ],
                  ),
            ])
          : null;

        const applyResultBlock = applyResult
          ? h('div', { key: 'done', style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border1}` } }, [
              h('div', { key: 'h', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, [
                h('span', { key: 'ok', style: { fontSize: 12, color: applyResult.applied === false ? T.muted : T.success } }, applyResult.applied === false ? t('applyNothing') : t('applied')),
                applyResult.backupPath
                  ? h(
                      'button',
                      { key: 'b', type: 'button', style: S.ghost, onClick: () => handleCopy('backup', String(applyResult.backupPath)) },
                      copyFeedback && copyFeedback.kind === 'backup' && copyFeedback.ok
                        ? `${t('backup')}: ${t('copied')}`
                        : `${t('backup')}: ${t('copy')}`,
                    )
                  : null,
                applyResult.restartRequired ? h('span', { key: 'r', style: Object.assign({}, S.hint, { color: T.warn }) }, t('restartRequired')) : null,
              ]),
              applyResult.backupPath
                ? h(
                    'code',
                    { key: 'bp', style: Object.assign({}, S.mono, { fontSize: 11, color: T.muted, wordBreak: 'break-all' }) },
                    String(applyResult.backupPath),
                  )
                : null,
              h('div', { key: 'rh', style: S.hint }, t('results')),
              h(
                'div',
                { key: 'rows', style: { display: 'flex', flexDirection: 'column' } },
                Array.isArray(applyResult.results) && applyResult.results.length
                  ? applyResult.results.map((entry, index) => {
                      const action = entry && entry.action ? String(entry.action) : '';
                      const tone = entry && entry.ok === false ? T.error : action === 'skipped' ? T.muted : T.success;
                      return h(
                        'div',
                        {
                          key: `${entry && entry.spec ? entry.spec : 'r'}-${index}`,
                          style: { display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 2px', flexWrap: 'wrap' },
                        },
                        [
                          h(
                            'span',
                            {
                              key: 's',
                              style: Object.assign({}, S.mono, { fontSize: 11, color: T.label, flex: '1 1 220px', minWidth: 0, wordBreak: 'break-all' }),
                            },
                            entry && entry.spec ? String(entry.spec) : '—',
                          ),
                          tag('a', ACTION_KEYS[action] ? t(ACTION_KEYS[action]) : action || '—', tone),
                          entry && entry.reason
                            ? h('span', { key: 'r', style: Object.assign({}, S.hint, { flex: '1 1 100%', paddingLeft: 0 }) }, `${t('reasonLabel')}: ${entry.reason}`)
                            : null,
                        ],
                      );
                    })
                  : [h('div', { key: 'none', style: S.hint }, t('emptyResults'))],
              ),
            ])
          : null;

        const importBlock = h('div', { key: 'import', style: { display: 'flex', flexDirection: 'column', gap: 8 } }, [
          sectionHead('import-head', t('importTitle')),
          h('div', { key: 'lead', style: S.lead }, t('importLead')),
          h(
            'div',
            {
              key: 'drop',
              onClick: () => {
                if (!planning && !applying && fileInput.current) fileInput.current.click();
              },
              onDragOver: (event) => {
                event.preventDefault();
                if (!dragOver) setDragOver(true);
              },
              onDragEnter: (event) => {
                event.preventDefault();
                if (!dragOver) setDragOver(true);
              },
              onDragLeave: (event) => {
                event.preventDefault();
                if (dragOver) setDragOver(false);
              },
              onDrop: onDrop,
              style: {
                marginTop: 2,
                padding: '18px 16px',
                borderRadius: 10,
                border: `1px dashed ${dragOver ? T.brand : T.border2}`,
                background: dragOver ? T.bg2 : 'transparent',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                cursor: planning || applying ? 'default' : 'pointer',
                outline: 'none',
              },
            },
            [
              h('div', { key: 't', style: { fontSize: 12, color: T.label } }, t('dropHere')),
              h('div', { key: 'h', style: S.hint }, t('acceptHint')),
              h(
                'button',
                {
                  key: 'b',
                  type: 'button',
                  style: Object.assign({}, S.outline, { marginTop: 4 }),
                  disabled: planning || applying,
                  onClick: (event) => {
                    event.stopPropagation();
                    if (fileInput.current) fileInput.current.click();
                  },
                },
                planning ? t('previewing') : t('chooseFile'),
              ),
              fileName
                ? h('div', { key: 'f', style: Object.assign({}, S.mono, { fontSize: 11, color: T.muted, marginTop: 2, wordBreak: 'break-all' }) }, fileName)
                : null,
              h('input', {
                key: 'input',
                ref: fileInput,
                type: 'file',
                accept: '.zip,.dshpack,.dshpack.zip',
                style: { display: 'none' },
                onChange: (event) => {
                  const list = event.target.files;
                  if (list && list.length) onFile(list[0]);
                },
              }),
            ],
          ),
          h('div', { key: 'paste', style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 } }, [
            h('div', { key: 'h', style: { fontSize: 12, color: T.muted } }, t('pasteTitle')),
            h('textarea', {
              key: 'ta',
              value: planText,
              placeholder: t('pastePlaceholder'),
              spellCheck: false,
              disabled: planning || applying,
              onChange: (event) => setPlanText(event.target.value),
              style: Object.assign({}, S.textarea, S.mono, { fontSize: 11 }),
            }),
            h('div', { key: 'actions', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, [
              h(
                'button',
                {
                  key: 'p',
                  type: 'button',
                  style: Object.assign({}, S.outline, { opacity: planning ? 0.5 : 1 }),
                  disabled: planning || applying,
                  onClick: previewText,
                },
                planning ? t('previewing') : t('previewAction'),
              ),
              h('button', { key: 'c', type: 'button', style: S.ghost, disabled: planning || applying || (!plan && !planText && !fileName), onClick: clearPlan }, t('clear')),
              planError
                ? h('span', { key: 'e', style: { fontSize: 11, color: T.error } }, planError)
                : null,
            ]),
          ]),
          planBlock,
          applyResultBlock,
        ]);

        return h(
          Boundary,
          { t },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, padding: '2px 0 12px', maxWidth: 780 } }, [
            h('div', { key: 'head', style: { display: 'flex', alignItems: 'flex-start', gap: 12 } }, [
              h('div', { key: 'text', style: { flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 } }, [
                h('div', { key: 'title', style: { fontSize: 16, fontWeight: 600, color: T.label, lineHeight: '24px' } }, t('title')),
                h('div', { key: 'lead', style: S.lead }, t('lead')),
                h(
                  'div',
                  { key: 'status', style: Object.assign({}, S.mono, { fontSize: 11, color: T.dimmed, marginTop: 2, wordBreak: 'break-all' }) },
                  t('statusLine', { profile: profileText, dsh: dshText, out: outText }),
                ),
                h('div', { key: 'stats', style: S.hint }, t('statsLine', { total: stats.total, installable: stats.installable, local: stats.local })),
                notes.length
                  ? h(
                      'div',
                      { key: 'notes', style: { display: 'flex', flexDirection: 'column', gap: 1, marginTop: 2 } },
                      notes.map((note, index) =>
                        h('div', { key: `n${index}`, style: Object.assign({}, S.hint, { color: T.warn }) }, String(note)),
                      ),
                    )
                  : null,
              ]),
              h(
                'button',
                { key: 'refresh', type: 'button', style: Object.assign({}, S.ghost, { flex: '0 0 auto' }), disabled: refreshing, onClick: loadState },
                refreshing ? t('loading') : t('refresh'),
              ),
            ]),
            loadError
              ? h('div', { key: 'loaderr', style: { fontSize: 11, color: T.error } }, t('stateFailed') + loadError)
              : null,
            exportBlock,
            importBlock,
          ]),
        );
      };
    }

    return {
      name: 'modpack',
      inject: ['slots'],
      apply(ctx) {
        const dict = { zh, en };
        const boxes = { locale: { current: undefined } };
        const builtinDict = () => {
          try {
            return String(navigator.language || '').toLowerCase().startsWith('zh') ? zh : en;
          } catch (error) {
            return zh;
          }
        };
        const t = (key, params) => {
          const bound = boxes.locale.current;
          if (typeof bound === 'function') {
            try {
              const value = bound(key, params);
              if (typeof value === 'string' && value !== key) return value;
            } catch (error) {
              /* 宿主词典没有这条，退回内置 */
            }
          }
          const table = builtinDict();
          const value = table[key];
          if (typeof value !== 'string') return key;
          return interpolate(value, params);
        };

        const Panel = buildPanel(ctx, t);

        try {
          ctx.inject(['locale'], (scope) => {
            const locale = safeGet(scope, 'locale');
            if (!locale || typeof locale.register !== 'function') return undefined;
            const off = locale.register(NS, dict);
            boxes.locale.current = typeof locale.bind === 'function' ? locale.bind(NS) : undefined;
            return () => {
              boxes.locale.current = undefined;
              if (typeof off === 'function') off();
            };
          });
        } catch (error) {
          console.error('[modpack] late-bind locale failed:', error);
        }

        try {
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              {
                name: 'settings.section',
                id: NS,
                order: 45,
                label: () => t('tab'),
                locale: NS,
                inject: () => ({ t }),
              },
              Panel,
            ),
          );
        } catch (error) {
          console.error('[modpack] register settings.section failed:', error);
        }
      },
    };
  },
});
