# 相关工作对比（RELATED）

> 调研时间：2026-10-19。信息来自本机 dshmarket 源码与各项目 README / npm 元数据 / 市场索引，未安装任何插件、未实机跑通导入。

## 一句话结论

**截至 2026-10，"导出小 zip、导入时按清单自动 npm 重装"的 PCL 式 DSH 整合包已经存在**：[DSH-PackForge/dsh-pack-plugin](https://github.com/DSH-PackForge/dsh-pack-plugin) 的 `.dspack` 格式及其社区市场（导入时 pnpm 重建依赖并对账）。但它默认还会带 profile 配置与 `pnpm-lock.yaml`、且绑定官方桌面端，**不是"只含清单+版本"的极简形态**；这种极简形态在调研范围内未见独立实现。

而任务点名的 dsh-config-sync / dsh-config-manager / dsh-helloai-bak **都是备份/迁移工具，不是整合包**；dshmarket 自带备份最接近"清单+按清单重装"，但产物是单个 JSON（不是可分享的小 zip），定位是整机 profile 备份。

## 对比表

| 工具 | 打包内容 | 导入行为 | 与 dsh-modpack 的差异 |
| --- | --- | --- | --- |
| **dshmarket 自带「备份与恢复」**（本机 desktop profile，`dsh-profile-backup` v0.2） | 单个 JSON：profile 配置 + `package.json` 清单（依赖 spec）；**不含** `node_modules` / `pnpm-lock.yaml` / `.dsh-market`；≤2 MB、≤256 个文件；通道＝本地 JSON 下载 / WebDAV / 私有 Gist（1 MB） | 校验格式 → 预览 → 合并现有 manifest（保留本机独有插件）→ `dsh plugin install`（pnpm install），失败再逐个 `dsh plugin add`；**无发布/分享格式**，Gist 是私有跨机同步 | 整机备份定位，会写配置、可能含凭据（`config.toml`/`.env`，不脱敏）；不是 zip、无市场；dsh-modpack 只导出勾选插件的清单+版本，小 zip 可分享 |
| **[huihui0927/dsh-config-sync](https://github.com/huihui0927/dsh-config-sync)** | 可移植 ZIP：profile 配置（`package.json`、`pnpm-lock.yaml`、`cordis.yml`/patch 等）+ home 配置 + 插件状态；不含 `node_modules`；凭据默认排除、显式要求时 AES-256-GCM 加密；会话可选 | 默认只预览，`apply` 才写，写前自动还原点；**不自动装依赖**——恢复后打印 `dsh plugin add` 命令让用户手动逐条装 | 备份/迁移，会写 profile 配置与插件数据；无市场/发布；dsh-modpack 导入即安装，不碰配置 |
| **[xiajiajun516/dsh-config-manager](https://github.com/xiajiajun516/dsh-config-manager)** | ZIP（`manifest.json` + 分区 + SHA-256 校验）：settings / providers / plugins / MCP / skills / presets / workspaces / sessions 可选；默认不含密钥，可加密；`link:`/`file:` 本地插件用 `npm pack` 连代码打进包；profile 栈本身不进备份 | 预览 → 冲突决策 / 路径映射 → 应用 → 校验 → 失败回滚；导入计划会列出"需安装的插件"并在应用阶段安装；另带配置市场（浏览 / 发布共享配置）与定时备份、Git/WebDAV/S3/Gist 同步 | 重量级整机迁移套件（十余类内容+多同步渠道）；dsh-modpack 只按清单装插件、包体积小、无迁移配置的野心 |
| **[hello-heyongping/dsh-helloai-bak](https://github.com/hello-heyongping/dsh-helloai-bak)** | ZIP：`$DSH_HOME` 设置、**凭据（`.credentials.yaml` 默认进包）**、skills、Agent 预设、任务板、profile 配置，以及本地插件完整代码 + 生产依赖；不含聊天记录/日志 | 逐文件覆盖（目标文件比归档新且内容不同则跳过），恢复前自动打快照；无作用域选择；README 未提按清单重装 registry 插件，只对本地插件补运行依赖，pkg 侧重整包还原 | 整机快照 + 本地插件搬运，含凭据、体积大；dsh-modpack 不打包插件代码与凭据 |
| **[DSH-PackForge/dsh-pack-plugin](https://github.com/DSH-PackForge/dsh-pack-plugin)**（`.dspack`，**同赛道最接近 PCL**） | 标准 ZIP：`dspack.json`（format/version）+ `manifest.json`；profile 形态含 `package.json`/`pnpm-workspace.yaml`/`pnpm-lock.yaml`、`overrides/`、`home/`（skills 等）；安全规则排除 `node_modules`/`dist`/密钥/嵌套压缩包；可选 `vendor/` 依赖 tarball（默认不联网探测） | 本地文件 / URL / 市场包；`sha256`+`size` 校验，**pnpm 重建依赖并对账**；支持多 profile 切换与 home 级 skills/presets 隔离；市场 `index.json` 现有 8 个包（3.9 KB–1.1 MB） | 同赛道最接近，但面向官方桌面端、还管 profile/home 隔离；打包默认带 profile 配置与 lock；dsh-modpack 用 `.dshpack.zip`、只取清单+版本（配置可选），更轻 |
| **发行版级整合包**：[dsh-fullstack-pack](https://github.com/Jonah-Wu23/dsh-fullstack-pack) / [ptonlix/dsh-forge](https://github.com/ptonlix/dsh-forge) | 固定整合包：~700 MB 绿色 ZIP（便携 Node + 预装 8 插件）；DSH Forge 则是构建期组合 + Electron 安装包 + 锁定依赖闭包/SBOM | 解压即用 / 安装包装；不按清单在线重装；DSH Forge 在构建期锁定依赖 | 分发级方案（捆绑运行时，不可给现有 DSH 增量装）；dsh-modpack 是运行时插件，导出/导入小包 |

## 证据链接

**本机 dshmarket 源码（desktop profile，2026-10 版本）**

- `C:\Users\Administrator\.dsh\profiles\desktop\node_modules\dshmarket\src\backup.ts`：格式 `dsh-profile-backup` v0.2（:19）、跳过 `node_modules`/`pnpm-lock.yaml`（:22）、2 MB / 256 文件上限（:20/:21）、导出（:89-141）、恢复为逐文件写回（:176-207）。
- 同目录 `src/routes.ts`：恢复入口要求 pnpm（:1767）、合并 manifest 后执行 `dsh plugin install`（:1791）；`/dsh-market/backup` 返回 JSON 附件（:2358-2393）；`/dsh-market/restore`、`/webdav`、`/gist`（:2395-2499）。
- 同目录 `src/gist.ts`：Gist 单文件 `dsh-profile-backup.json`、私有、1 MB 上限（:30-33）。
- 同目录 `client/client.js` 内置文案：`备份只包含插件清单和 profile 配置，不含插件文件；恢复时按清单重新安装`；凭据警告：`备份包含 profile 配置，以及可能含密钥的文件（config.toml、.env 等）`。

**外部项目（README / npm / 市场索引，2026-10-19 抓取）**

- dsh-config-sync：<https://github.com/huihui0927/dsh-config-sync>（README raw：<https://raw.githubusercontent.com/huihui0927/dsh-config-sync/main/README.md>）；npm `dsh-config-sync@1.2.1`：<https://www.npmjs.com/package/dsh-config-sync>
- dsh-config-manager：<https://github.com/xiajiajun516/dsh-config-manager>（README raw：<https://raw.githubusercontent.com/xiajiajun516/dsh-config-manager/main/README.md>）；npm：<https://www.npmjs.com/package/dsh-config-manager>
- dsh-helloai-bak：<https://github.com/hello-heyongping/dsh-helloai-bak>（README raw：<https://raw.githubusercontent.com/hello-heyongping/dsh-helloai-bak/main/README.md>）
- dsh-pack-plugin：<https://github.com/DSH-PackForge/dsh-pack-plugin>（README raw：<https://raw.githubusercontent.com/DSH-PackForge/dsh-pack-plugin/master/README.md>）；npm `@dsh-packforge/dsh-pack-plugin@0.3.5`：<https://www.npmjs.com/package/@dsh-packforge/dsh-pack-plugin>
- `.dspack` 市场：<https://dsh-packforge.github.io/dsh-pack-market/>；索引（schemaVersion 2，generatedAt 2026-10-17）：<https://dsh-packforge.github.io/dsh-pack-market/index.json>
- 发行版级：dsh-fullstack-pack <https://github.com/Jonah-Wu23/dsh-fullstack-pack>；DSH Forge <https://github.com/ptonlix/dsh-forge>

## 不确定项

- dsh-pack-plugin 只核对了 README、npm 元数据和市场 `index.json`，**未实机导出/安装**；其 README 自述 `export` / `install` 端到端"仍需真实 profile + pnpm 环境验证"。
- 三个社区插件的"导入时是否自动 pnpm 安装"部分来自 README 行为描述（dsh-config-manager 预览会列"需安装插件"，dsh-config-sync 明确不自动装）；未逐版本实机验证。
- 市场 `index.json` 由第三方组织（DSH-PackForge）维护，非官方目录；收录 8 个包是 2026-10-17 的快照，之后会变。
- dshmarket 结论基于本机 desktop profile 内该版本源码（文件时间 2026-10-11～10-18）；不同 dshmarket 版本行为可能不同。
- dsh-helloai-bak 的"凭据默认进包"来自其 README 明示，未逐版本核对；dsh-config-sync / dsh-config-manager 的加密实现细节亦未审计。
- dsh-modpack 自身范围以本仓库 README/API 为准；本文按当前 `API.md`（清单+版本、`.dshpack.zip`、导入经 `pluginManager.installBundle`）描述差异。
