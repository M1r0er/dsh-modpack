# 验证记录

> 环境：Windows 10/11，DSH desktop profile（DeepSeek Harness 0.2.1-rc.2），2026-10-19。

## 已通过（离线 / 进程内）

| 项 | 命令 | 结果 |
| --- | --- | --- |
| ZIP 读写 | `node tests/zip.test.mjs` | 5/5：往返、中文名、空文件、二进制；CRC 篡改被拒；`..`/绝对路径被拒；crc32 与已知值一致 |
| 清单 / 命令 / 脱敏 | `node tests/pack.test.mjs` | 9/9：spec 分类、命令解析（含用户示例格式与 github `#ref`）、密钥剔除（`apiKey` 被替换、`apiKeyEnv` 不误伤）、diff、manifest 校验 |
| Host 全链路（mock Cordis 服务） | `node tests/host.test.mjs` | 3/3：导出→读包→预览（不安装）；apply 只装缺失项并写还原点；包内 disabled 行被关闭、withConfig 才改配置 |
| Client 模块 | `node tests/client-smoke.test.mjs` | 1/1：`__ModuleLoader__.load` id 正确、`apply` 注册 `settings.section`（id=modpack, order=45）、Panel 首帧可渲染 |
| 标准 ZIP 兼容 | PowerShell `Expand-Archive` | 本插件生成的 zip 可被系统解压，中文文件名与 UTF-8 内容正常 |
| 语法 | `node --check index.js && node --check client.js` | 通过 |
| 图标 | PowerShell `[xml]` 解析 | 合法 SVG，viewBox 0 0 24 24，372 B |

## 已完成的运行时检查

- `plugin_manager install_bundle` 成功：`dsh-modpack@0.1.0` 写入 desktop profile，`package.json` 依赖为 `link:D:/DSH Workspace/dsh-modpack`，bundle 选择已持久化。
- `list_bundles` 能看到 `dsh-modpack` 行，显示标题/描述来自本包元数据。
- 安装结果为 **restart-required**（`restartReason: package-moved`），因此本进程内 `/modpack/*` 仍 404、工具尚未出现在当前 Agent 的 Tool 列表中——这属于 DSH 对新 Host 模块的预期行为，不是插件错误。

## 待重启后补验（必须）

1. `Tool.listTools` 出现 `modpack_list` / `modpack_export` / `modpack_inspect` / `modpack_import`。
2. 调用 `modpack_list`，确认能读出真实 profile 的第三方 bundle（≥15 个）。
3. 调用 `modpack_export`（`writeArchive:false` 与默认写 zip 各一次），确认：
   - 命令串包含 `dsh plugin --profile desktop add …`；
   - 本地链接插件（如 `dsh-workspace-gate`）只进警告、不进命令；
   - zip 体积 < 100 KB，`dshpack.json` 可读，无明文密钥；
   - `modpack_inspect` 预览状态与导出数量一致；
   - 全程不执行安装。
4. `cordis_inspect_query` (client) 查 `settings.section`，确认出现 `id=modpack` 的 Client 注册；浏览器打开 设置 → 整合包，检查列表、导出、拖放预览（视觉与交互在重启后确认）。
