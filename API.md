# dsh-modpack Host API 契约（v1）

Host 半在同一个 origin 下注册 prefix 路由 `/modpack/*`，Client 半（设置页）用 `fetch` 调用。
所有响应都是 JSON；`ok:false` 时另带 `error` 字符串。请求体为 JSON（`content-type: application/json`）。

## GET `/modpack/state`

当前 profile 的第三方插件清单与默认值。

```jsonc
{
  "ok": true,
  "profile": "desktop",              // 探测不到时为 null
  "dshVersion": "0.2.1-rc.2",        // 探测不到时为 null
  "outDir": "C:\\Users\\mi\\.dsh\\modpacks",
  "plugins": [
    {
      "name": "dsh-better-sidebar",
      "version": "0.28.0",
      "spec": "dsh-better-sidebar@0.28.0", // 可用于 `dsh plugin add` 的 spec
      "source": "dsh-better-sidebar@0.28.0",
      "kind": "registry",            // registry | git | tarball | local | unknown
      "installable": true,           // false = link:/本地目录且 npm 上查不到同名同版本
      "local": false,
      "published": true,             // 仅本地链接且已发布到 npm 时出现：导出按 name@version
      "official": false,
      "optional": false,
      "description": "Better Sidebar for DSH …",
      "enabled": true,               // bundle 层是否启用
      "rows": [                      // 该 bundle 插入的行
        { "patchId": "better-sidebar", "moduleName": "dsh-better-sidebar", "enabled": true }
      ]
    }
  ],
  "stats": { "total": 15, "installable": 13, "local": 2 },
  "notes": ["中文提示，可空"]
}
```

## POST `/modpack/export`

请求：

```jsonc
{
  "name": "我的整合包",          // 可选；默认 "DSH 整合包"
  "version": "1.0.0",           // 可选
  "author": "",                 // 可选
  "description": "",            // 可选
  "include": ["dsh-ops", "..."],// 可选；省略或空数组 = 全部插件
  "embed": ["dsh-local-x"],     // 可选；未发布 npm 的本地插件名 → npm pack 后随包携带
  "embedLocal": false,          // 可选；true = 自动内置全部“本地链接且未发布 npm”的选中插件
  "profile": "desktop",         // 可选；命令里 --profile 的值，省略用探测值
  "includeConfig": false,       // 可选；是否把 configEditor 的 override 一并打进包
  "redactSecrets": true,        // 可选；includeConfig 时是否剔除疑似密钥（默认 true）
  "outputDir": "C:\\...\\modpacks" // 可选；默认 ~/.dsh/modpacks
}
```

响应：

```jsonc
{
  "ok": true,
  "path": "C:\\Users\\mi\\.dsh\\modpacks\\我的整合包-1.0.0.dshpack.zip",
  "bytes": 4821,
  "embeddedCount": 0,           // 内置插件数量（>0 时 zip 内含 embedded/*.tgz）
  "commands": [
    "dsh plugin --profile desktop add dsh-better-sidebar@0.28.0",
    "dsh plugin --profile desktop add dsh-ops@0.3.0"
  ],
  "commandText": "dsh plugin --profile desktop add …\ndsh plugin --profile desktop add …",
  "manifest": { /* 与 zip 内 dshpack.json 相同 */ },
  "warnings": ["2 个插件是本机链接目录，已标记为不可安装，导入时会被跳过。"]
}
```

`path` 为 `null` 表示 `writeArchive:false`（只生成命令，不写文件）；此时不能请求 `embed`。

## POST `/modpack/plan`

预览导入，不改变任何状态。`pack` 与 `text` 二选一：

- `pack`: `.dshpack.zip` / `.zip` / `.dshpack` 的 base64（可带 `data:...;base64,` 前缀）。
- `text`: 直接粘贴的 `dsh plugin [--profile X] add <spec>` 命令串（每行一条，`#` 为注释）。

响应：

```jsonc
{
  "ok": true,
  "source": "archive",          // archive | commands
  "name": "我的整合包",
  "manifest": { /* … 或 null（命令串没有清单） */ },
  "commands": [
    {
      "spec": "dsh-better-sidebar@0.28.0",
      "command": "dsh plugin --profile desktop add dsh-better-sidebar@0.28.0",
      "status": "installed-same" // installed-same | installed-different | missing | local | unknown
    },
    {
      "spec": "dsh-local-x@1.0.0",
      "status": "missing",
      "embedded": { "tarball": "embedded/dsh-local-x-1.0.0.tgz", "sha256": "…", "size": 12345 }
    }
  ],
  "statuses": { "same": 8, "different": 1, "missing": 3, "local": 2, "unknown": 0 },
  "configCount": 0,             // 包内可应用的 config override 条数
  "embeddedCount": 0,           // 包内内置插件数量（>0 时 apply 需 allowEmbedded）
  "warnings": []
}
```

## POST `/modpack/import`

```jsonc
{
  "pack": "…base64…",   // 或 "text": "dsh plugin …"
  "apply": false,       // false = 仅 plan（同 /modpack/plan）；true = 真的安装/应用
  "allowEmbedded": false,// 包内含内置插件时必须 true 才安装（默认拒绝）
  "profile": "desktop", // 可选，仅用于生成命令文本
  "withConfig": false   // 可选：是否应用包内 config（默认 false，需显式开启）
}
```

响应：

```jsonc
{
  "ok": true,
  "applied": true,
  "plan": { /* 同 /modpack/plan 响应 */ },
  "results": [
    { "spec": "dsh-better-sidebar@0.28.0", "action": "installed", "ok": true },
    { "spec": "dsh-local-x@1.0.0", "action": "embedded", "ok": true, "tarball": "C:\\Users\\mi\\.dsh\\modpacks\\embedded\\dsh-local-x-1.0.0-ab12cd34.tgz" }
  ],
  "backupPath": "C:\\Users\\mi\\.dsh\\modpacks\\backups\\2026-10-19T00-30-00.json", // apply 时的还原点
  "restartRequired": false
}
```

安装动作通过 `pluginManager.installBundle(spec, { saveExact: true })` 完成，不调用 shell，不执行 `dsh plugin` 文本。
- registry 插件：直接传 `name@version` / git spec；
- 内置插件：先按清单 sha256/size 校验 zip 内 tarball，落到 `<outDir>/embedded/`，再把 tarball 绝对路径传给 `installBundle`。

`apply:true` 前 Host 先把当前状态写一份 JSON 还原点到 `outDir/backups/`。

## 错误约定

- 400：参数非法、zip 损坏、缺少 `dshpack.json`。
- 500：Host 内部异常，`error` 为可读字符串。
- 所有工具/路由返回的 JSON 必须可以被 `JSON.stringify`（不要回传 Loader Entry 对象）。
