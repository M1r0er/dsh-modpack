# 验证记录

> 环境：Windows 10/11，DSH desktop profile（DeepSeek Harness 0.2.1-rc.2）。最后更新：2026-10-20（v0.2.0）。

## 自动化测试

| 套件 | 命令 | 结果 |
| --- | --- | --- |
| ZIP 读写 | `node tests/zip.test.mjs` | 5/5：往返、中文名、空文件、二进制；CRC 篡改被拒；`..`/绝对路径被拒；crc32 与已知值一致 |
| 清单 / 命令 / 脱敏 / 内置 | `node tests/pack.test.mjs` | 11/11：spec 分类、命令解析（含 github `#ref`）、密钥剔除（`apiKey` 被替换、`apiKeyEnv` 不误伤）、diff、manifest v2 校验、内置 tarball 路径/sha/size 拒绝规则 |
| Host 全链路（mock Cordis 服务） | `node tests/host.test.mjs` | 5/5：导出→读包→预览（不安装）；apply 只装缺失项并写还原点；disabled 行；本地已发布 npm 的插件转 `name@version`；内置插件导出→目标机预览→sha 校验→`installBundle(tarball)`，未带 `allowEmbedded` 拒绝、sha 篡改拒绝 |
| Client 模块 | `node tests/client-smoke.test.mjs` | 1/1：`__ModuleLoader__.load` id 正确、`apply` 注册 `settings.section`（id=modpack, order=45）、Panel 首帧可渲染、`isShareable`/`isEmbeddable` 判定 |
| 语法 | `node --check index.js && node --check client.js` | 通过 |

合计 **22** 项。

## 真机验证（2026-10-19 / 2026-10-20）

- 重启后工具上线：`modpack_list` / `modpack_export` / `modpack_inspect` / `modpack_import` 出现在 Tool 列表；设置页注册 `settings.section`（`id=modpack`，order 45，active）。
- `modpack_list`：读到真实 profile 的第三方 bundle（当时 15 个）。
- `modpack_export`：生成 5.0 KiB 整合包、13 条安装命令；两个 `link:` 插件（`dsh-modpack`、`dsh-workspace-gate`）正确跳过。
- `modpack_inspect`：13 已装同版本 + 2 本地链接跳过，与导出数量一致。
- 2026-10-20：Host 已把「本地链接但 npm 同版本已发布」升级为 `installable/published`；Client 残留的 `local===true → 不可选` 分支已修复（v0.1.2），`dsh-workspace-gate` / `dsh-inkvault` 可勾选导出。
- 2026-10-20：**真实 pnpm pack 冒烟**（不安装）——对 `dsh-workspace-gate` 目录执行 `pnpm pack`，得到 41.9 KiB tarball，写入 zip 的 `embedded/dsh-workspace-gate-0.1.1.tgz`，清单 `formatVersion: 2`、sha256/size 正确，README 含内置说明。
- 标准 ZIP 兼容：本插件生成的 zip 可被 PowerShell `Expand-Archive` 解压。
- 图标：合法 SVG，viewBox 0 0 24 24，372 B。

## 尚未实机执行（明确边界）

- 内置插件的**真实安装**（`installBundle(tarball)` + pnpm 落库）只在 mock 服务中验证，未在本机 profile 实装，以免把开发中的 `link:` 依赖改成 tarball 依赖。首次真实使用请在可回滚的 profile 上验证。
- 浏览器内设置页的视觉/拖放交互未做截图级验证（Client 注册与判定已由 smoke 测试覆盖）。
