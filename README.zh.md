# dsh-custom-instructions

**给 DeepSeek Harness 用的类 Codex 自定义指令**——在设置面板里编辑一份全局指令，对本机所有会话、所有模型生效。

[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--rc.2-4f46e5?style=flat-square)](#兼容性)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-10%20passing-22c55e?style=flat-square)](#开发)

[English](README.md) · [简体中文](README.zh.md)

---

和 Codex 的全局 `AGENTS.md`、ChatGPT 的 Custom Instructions 一样：你在「自定义指令」面板里写下的内容，之后每次对话都会自动携带。不用再新建一个会话就重新交代一遍背景。

![设置中的「自定义指令」面板](assets/screenshot.png)

## 目录

- [为什么需要它](#为什么需要它)
- [功能](#功能)
- [安装](#安装)
- [原理](#原理)
- [兼容性](#兼容性)
- [安全](#安全)
- [开发](#开发)
- [许可](#许可)

## 为什么需要它

DeepSeek Harness 本来就会读取 `~/.dsh/AGENTS.md` 并注入每个会话的系统提示。它缺的只是一个入口——不离开应用、不用去磁盘上翻文件，就能改这份内容。

这个插件只做一件事：在设置里给这个文件配一个编辑器。不改指令机制，不加包装层，不引入影子配置。

## 功能

| | |
| --- | --- |
| **全局，不按项目分** | 一份文件 `~/.dsh/AGENTS.md`，所有会话、所有模型通用。 |
| **直接落盘** | 没有同步层、没有隐藏状态——你保存的就是 `dsh-agent-instructions` 读取的那份文件。 |
| **首次即可用** | `AGENTS.md` 不存在也能直接保存，父目录会自动创建。 |
| **即时反馈** | 等宽编辑器回显文件内容，每次保存就地提示成功或失败。 |
| **零构建** | 客户端是手写的 `window.__ModuleLoader__.load` bundle，宿主是纯 Node ESM，安装无需构建授权。 |
| **跨站防护** | 端点强制同源校验，详见[安全](#安全)。 |

## 安装

### 从 GitHub 安装

```bash
dsh plugin --profile web add github:lyke-61/dsh-custom-instructions
```

重启一次 `dsh web`，让 bundle 层加载生效。

### 手动安装

如果 `dsh plugin` 不可用，手动挂载分三步。

**1.** 在 profile 中添加依赖：

```jsonc
// ~/.dsh/profiles/web/package.json
{
  "dependencies": {
    "dsh-custom-instructions": "github:lyke-61/dsh-custom-instructions"
  }
}
```

**2.** 添加 loader 行：

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: custom-instructions
      name: dsh-custom-instructions
```

> 走 `dsh plugin` 命令的话这一步会自动完成——本仓库自带 `cordis.patch.yml`，那种情况下你只需要加依赖行。

**3.** 安装并重启：

```bash
cd ~/.dsh/profiles/web && pnpm install
```

然后重启 `dsh web`。面板出现在 **设置 → 通用设置**。

### 卸载

```bash
dsh plugin --profile web remove dsh-custom-instructions
```

`~/.dsh/AGENTS.md` 不会被删除。

## 原理

一共三块，都很小：

| 层 | 文件 | 职责 |
| --- | --- | --- |
| **Host** | `lib/index.js` | 注册 `GET` / `POST /custom-instructions` 路由。目标路径经 `@deepseek-ai/dsh-home-paths` 解析——与 `dsh-agent-instructions` 读的是同一份文件。 |
| **Client** | `lib/client.js` | 在 `settings.general.item` 插槽注册面板（id `custom-instructions`，`order: -10`）。打开时 `fetch` 读取，保存时 `POST` 写回。 |
| **Bundle** | `cordis.patch.yml` | 挂载两个半边的 loader 行。 |

**为什么改完不用重载就生效。** 面板写的就是 `dsh-agent-instructions` 已经在注入的那份文件。新会话从第一条消息起就带上新内容；当前会话在下次 `read` / `write` / `edit` 文件操作后感知——那条路径本来就会重读一次指令块。

这里没有需要失效的缓存层，插件也从不自己去动提示词。

## 兼容性

| DSH 版本 | 状态 |
| --- | --- |
| `0.2.1-rc.2` | **实测通过**（独立 `DSH_HOME` 起真实实例验证） |
| `0.1.x` | 支持 |
| `< 0.1.0-rc.6` | 未测试 |

DSH 0.2.x 未破坏插件依赖的任何宿主契约——`ctx.webServer.register` 签名、`dshHomePath` 导出、`settings.general.item` 插槽、`__ModuleLoader__` 协议、`react ^18.2.0` 均未变。逐项对照表见 [CHANGELOG.md](CHANGELOG.md)。

> **依赖内置的 `dsh-agent-instructions`**（`standard` 预设默认携带）。若你的 profile 禁用了它，面板仍能编辑文件，但内容不会被注入。

## 安全

`AGENTS.md` 会进入**每个**会话的系统提示。能改写它的页面，就能左右你的每一次对话——这是绕了一层的提示词注入。

插件注册的路由**不在 `/api` 的浏览器信任围栏后面**。实测确认：`GET /` 返回 `401`，而 `GET /custom-instructions` 返回 `200`。因此端点自带守卫：

- 携带 `Origin` 的请求必须与 `Host` 一致，否则返回 **`403`**——读和写都拦。
- 不带 `Origin` 的请求（curl、本机脚本）放行。浏览器无法跨站发出这类请求。

**这不是完整鉴权。** 宿主默认只绑 `127.0.0.1`，攻击面限于本机进程。如果你用 `--host` 暴露到非 loopback 地址，请自行在反向代理层加鉴权——这个插件不负责这件事。

其他加固：请求体上限 1 MiB（超限返回 `413`）、`405` 响应携带 `Allow` 头、客户端遇到非 JSON 错误响应时如实报告 HTTP 状态而非抛裸 `SyntaxError`。

## 开发

无需构建。客户端 bundle 直接按 DSH 的线格式书写（`window.__ModuleLoader__.load({ id, factory })`）。

```bash
node --check lib/index.js       # 语法检查
node --check lib/client.js      # 语法检查
node test/contract.test.mjs     # 10 项契约测试，不依赖 DSH 本体
```

测试套件会注册一个 ESM loader hook，把 `dsh-home-paths` 映射到临时 stub，然后驱动真实 HTTP server 跑遍所有路由——包括跨站拒绝和超限请求。

| 文件 | 用途 |
| --- | --- |
| `lib/index.js` | 宿主半边——webServer 路由、文件读写、同源校验 |
| `lib/client.js` | 客户端半边——设置面板 |
| `cordis.patch.yml` | 挂载两边的 bundle patch |
| `test/contract.test.mjs` | 契约测试 |

## 许可

[MIT](LICENSE)。

针对 DSH 0.2.x 的适配记录见 [CHANGELOG.md](CHANGELOG.md)。
