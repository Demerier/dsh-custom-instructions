# 1.1.0 — 适配 DSH 0.2.x

## 兼容性结论

在 **DeepSeek Harness 0.2.1-rc.2** 上实测通过，同时保持对 0.1.x 的兼容。验证方式：用
`@deepseek-ai/dsh@0.2.1-rc.2` 起独立 web 实例（隔离 `DSH_HOME`），真实调用端点。

逐项核对的宿主契约（与 `@deepseek-ai/dsh-host-webserver@0.2.1-rc.2` 源码比对）：

| 依赖点 | 0.2.1-rc.2 状态 | 处理 |
|---|---|---|
| `ctx.webServer.register({ kind, path, handler })` | 签名未变 | 无需改动 |
| `inject: ['webServer']` | 服务仍在，`dsh-web-app` 也用它 | 无需改动 |
| `dshHomePath()` from `@deepseek-ai/dsh-home-paths` | 仍导出（`lib/index.js:168`） | 只需放宽 peer 范围 |
| `settings.general.item` 插槽 | 仍存在（`dsh-client-ui-settings-general`） | 无需改动 |
| `window.__ModuleLoader__.load({ id, factory })` | 协议未变 | 无需改动 |
| `react` | 仍是 `^18.2.0` | 无需改动 |
| `dsh-agent-instructions` 内置机制 | 仍是 `dsh-web-app` 依赖 | 无需改动 |

结论：**0.2.x 没有破坏性 API 变更**，本次改动集中在版本声明、健壮性与安全加固。

## 变更

### 版本声明

- `peerDependencies.@deepseek-ai/cordis`: `^4.0.1` → `>=4.0.1 <5.0.0`
- `peerDependencies.@deepseek-ai/dsh-home-paths`: `^0.1.0-rc.6` → `>=0.1.0-rc.6 <0.3.0`

  原因：`^0.1.0-rc.6` 对 0.x 版本只允许 `0.1.x`。宿主升到 `0.2.x` 后，这个范围会导致
  peer 冲突，pnpm 在 `autoInstallPeers: false` 的 profile 下可能直接拒绝安装。放宽后
  0.1.x 与 0.2.x 都可装。

- `react` 标为 optional peer：客户端 bundle 由宿主提供 react，插件自己不需要解析它。
- 新增 `engines.node >= 20`，与 DSH 自身要求一致。

### 安全加固：同源校验（防 CSRF）

0.2.x 的 `/api` 有浏览器信任围栏，但**插件的裸 HTTP 路由不在围栏之后**。实测确认：
访问 `/custom-instructions` 不经过 `/api` 信任检查，任何能连到本机端口的进程都能改写
`AGENTS.md` —— 而这个文件会被注入到**所有会话的系统提示**里，等价于任意提示注入。

新增 `isSameOrigin()`：请求带 `Origin` 且 host 与 `Host` 头不一致时返回 403。
- 无 `Origin` 的请求（curl、本机脚本）放行 —— 它们不构成浏览器侧 CSRF；
- 跨站读写都被拒绝，实测 `Origin: https://evil.example` → 403。

注意这是**纵深防御**，不是完整鉴权：宿主默认只绑定 `127.0.0.1`，攻击面限于本机进程。
若用 `--host` 暴露到非 loopback，请自行加反向代理鉴权。

### 健壮性

- **首次使用可保存**：`AGENTS.md` 及其父目录不存在时，写入前先 `mkdir -p`。
  原实现会在首次保存时抛 `ENOENT`（用户从没建过这个文件时必然触发）。
- **正文上限 1 MiB**：超限返回 413，避免超大粘贴把宿主内存打满。
- **HTTP 状态检查**：客户端原先直接 `response.json()`，`401/500` 时会抛 JSON 解析错误，
  面板只显示一串 `Unexpected token`。现在按状态码给出可读错误。
- **405 带 `Allow` 头**：符合 HTTP 语义，便于排障。

### 测试

新增 `test/contract.test.mjs`：一个不依赖 DSH 本体的契约测试，用自定义 ESM loader 把
`@deepseek-ai/dsh-home-paths` 映射到临时替身包，然后起真实 HTTP 服务跑 10 项断言：

```
node test/contract.test.mjs
```

覆盖：路由注册契约、首次读取空内容、保存并落盘（父目录自动创建）、回读一致、
非法方法 405、跨站写 403 且文件未改动、跨站读 403、同源放行、超限 413、坏 JSON 容错。

## 升级方式

```bash
# GitHub 源
dsh plugin --profile web add github:lyke-61/dsh-custom-instructions

# 或本地路径
dsh plugin --profile web add /path/to/dsh-custom-instructions
```

装完重启一次 `dsh web`（宿主模块与客户端 bundle 都在启动时加载）。

## 变更基线

本次适配基于 2026-08-16 的版本（面向 DSH `0.1.0-rc.6`）。
