# dsh-modpack · DSH 整合包

[![npm version](https://img.shields.io/npm/v/dsh-modpack.svg?color=cb3837&logo=npm)](https://www.npmjs.com/package/dsh-modpack)
[![license](https://img.shields.io/npm/l/dsh-modpack.svg)](LICENSE)

> npm：<https://www.npmjs.com/package/dsh-modpack> · 仓库：<https://github.com/M1r0er/dsh-modpack> · MIT · DSH 插件（bundle）

像 Minecraft 的 PCL / HMCL 整合包那样管理 DSH 的第三方插件：

- **导出**：勾选本机已安装的第三方插件 → 生成一个只有清单和版本的小体积 `.dshpack.zip`（**不含插件代码、不含 `node_modules`**），同时给出一整串可直接复制执行的安装命令。
- **导入**：选择 `.dshpack.zip` 或直接粘贴命令串 → 先**预览**（已装同版本 / 版本不同 / 待安装 / 本地链接）→ 确认后再按 spec 重新下载安装；apply 前自动写 JSON 还原点。
- **发布**：把几十 KB 的 zip 发给别人，对方在「设置 → 整合包 → 导入」里预览后一键装齐。

导出的命令形如（示例，不会自动执行）：

```sh
dsh plugin --profile desktop add dsh-ops@0.3.0
dsh plugin --profile desktop add dsh-better-sidebar@0.28.0
dsh plugin --profile desktop add github:owner/repo#v1.0.0
```

## 为什么不是"备份插件"

DSH 已有若干备份/迁移工具（见 [docs/RELATED.md](docs/RELATED.md)），它们通常打包**配置、凭据或本地插件目录**，体积大、偏向"整机搬家"。
整合包的定位相反：**只记录"装哪些插件、哪个版本"**，插件本体在导入时从 npm / git 重新下载。这与 PCL 整合包"只有 mods 清单、不含游戏本体"是同一种取舍：

| | 备份 / 迁移工具 | dsh-modpack |
| --- | --- | --- |
| 包内容 | 配置文件、凭据、可能含本地插件源码 | 清单 + 版本 + 安装命令（可选脱敏配置） |
| 体积 | 几百 KB ~ 数 MB | 通常几 KB ~ 几十 KB |
| 适合 | 换电脑、回滚 | 发布、分享、复现一套插件组合 |
| 导入 | 覆盖配置 | 按 spec 重新下载插件，先预览再应用 |

同赛道还有一个更重的项目：[@dsh-packforge/dsh-pack-plugin](https://github.com/DSH-PackForge/dsh-pack-plugin)（`.dspack`）。它默认把 profile 配置与 `pnpm-lock.yaml` 一起打包，导入时用 pnpm 重建依赖，并绑定官方桌面端；其 README 自述 `export` / `install` 端到端仍需真实 pnpm 环境验证。dsh-modpack 选的是更轻的形态：只记录"装哪些插件、哪个版本"，并直接给出可复制的 `dsh plugin add` 命令串。完整对比见 [docs/RELATED.md](docs/RELATED.md)。

## 安装

在 DSH 里用插件管理器安装本目录（或发布后的 npm 包）：

```sh
dsh plugin add dsh-modpack
```

安装后：

- **设置 → 整合包**：图形界面，勾选 / 导出 / 导入；
- **模型工具**：`modpack_list`、`modpack_export`、`modpack_inspect`、`modpack_import`，也可以让 Agent 代劳。

> 本插件依赖 DSH 内置的 `pluginManager` 与 `configEditor` 服务。老版本 DSH 若没有 `pluginManager`，导出命令串仍可用，自动安装会报"服务不可用"。

## 图形界面

设置页分两块：

1. **导出**
   - 列出当前 profile 的第三方 bundle（含版本、是否本地链接）；
   - 默认全选可安装项，`link:` / 本地路径插件置灰并标注"不可分享"；
   - 可填名称 / 版本 / 作者 / 描述；
   - 可选"包含配置"：只收**选中插件**的 config override，疑似密钥默认替换为 `${REDACTED}`；
   - 导出后显示 zip 路径与命令块，可一键复制。
2. **导入**
   - 拖入 `.dshpack.zip`，或粘贴命令串；
   - 预览表逐条列出 `spec` 与状态 `installed-same / installed-different / missing / local / unknown`；
   - 点"应用安装"需二次确认；执行完显示每一步结果、还原点路径；需要重启的改动会单独提示。

## 命令行 / Agent 工具

```jsonc
// 列出可导出的插件
{ "tool": "modpack_list" }

// 导出（不写 zip，只拿命令串）
{ "tool": "modpack_export", "writeArchive": false, "include": ["dsh-ops", "dsh-context"] }

// 导出为 zip（默认写到 ~/.dsh/modpacks）
{ "tool": "modpack_export", "name": "我的整合包", "version": "1.0.0" }

// 导入预览（默认 apply=false，绝不安装）
{ "tool": "modpack_import", "path": "D:/packs/我的整合包-1.0.0.dshpack.zip" }

// 确认后应用
{ "tool": "modpack_import", "path": "…", "apply": true }
```

`modpack_import` 的安装动作走 `pluginManager.installBundle(spec, { saveExact: true })`，**不执行 shell，也不执行粘贴文本里的任何命令**——命令串只被解析成 spec。

## 整合包格式

`.dshpack.zip` 是一个普通 zip，内含：

| 文件 | 作用 |
| --- | --- |
| `dshpack.json` | 清单：format/version、插件列表（name、version、spec、kind、bundle 行）、安装命令、可选 config |
| `install.ps1` / `install.sh` | 与清单一致的安装命令脚本 |
| `README.md` | 人类可读的说明 |

`dshpack.json` 关键字段见 [API.md](API.md)；`format` 固定为 `dsh-modpack`，`formatVersion` 为 1。导入时会校验格式版本，未来格式升级会给出明确提示。

## 安全

- 导出**从不安装**任何东西，也不联网。
- 导入默认只预览；`apply:true` 前会写 `<outDir>/backups/before-import-<时间>.json`。
- 包内不写插件代码；`config` 默认不导出，导出时会剔除密钥键与 `sk-` / `ghp_` / `xoxb-` 等明文 token。
- 本地链接插件（`link:` / 本地路径）不可移植：导出会标记并提示，导入时跳过，不会把别人的本地路径当成可下载 spec。
- 本插件的 HTTP 路由与 GUI 同源（`/modpack/*`），没有额外的跨域入口。

## 已知限制

- 只处理 **bundle**（`dsh.profile.bundles` / `package.json` 依赖）；随 DSH 发行的 installation 内置 bundle 不导出。
- 安装依赖目标机器能访问 npm / git，企业内网需要自行配置 registry。
- 版本对比是字符串精确比较；`name@latest` 这类浮动 spec 只能判断"已安装/未安装"。
- 不支持 zip64 / 加密 zip；整合包超过 32 MiB 会被拒绝（正常只有几 KB）。
- 配置导入（`withConfig` / 界面勾选）目前按 `patchId` 匹配本机行；行 id 被上游插件改名时会跳过并给出 reason。

## 开发

```sh
node --check index.js
node tests/zip.test.mjs
node tests/pack.test.mjs
node tests/host.test.mjs   # 用 mock Cordis 服务跑导出→预览→apply 全链路
```

- `lib/zip.mjs`：零依赖 zip 读写（store/deflate、CRC32、UTF-8 文件名）。
- `lib/pack.mjs`：清单构建/校验、spec 分类、命令解析、密钥剔除、diff。
- `index.js`：Host 半，接 `pluginManager` / `configEditor`，注册工具与 `/modpack/*` 路由。
- `client.js`：设置页，注册到 `settings.section`。

## 验证状态

- **2026-10-19 真机**（DSH 0.2.1-rc.2 / Windows）：重启后设置页已注册（`settings.section`，`id=modpack`，order 45，active）；`modpack_list` 读到 15 个第三方插件；`modpack_export` 生成 5.0 KiB 整合包 / 13 条安装命令（2 个本地链接自动跳过）；`modpack_inspect` 预览结果为 13 已装同版本 + 2 本地链接跳过。
- **离线**：18 项测试通过（zip 往返/CRC、命令解析、密钥剔除、mock Cordis 全链路、client 模块注册），详见 [docs/VERIFICATION.md](docs/VERIFICATION.md)。

## License

MIT
