# dsh-custom-instructions

**Codex-style custom instructions for DeepSeek Harness** — edit one global instruction file from the settings panel, and it applies to every conversation on this machine, across all models.

[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--rc.2-4f46e5?style=flat-square)](#compatibility)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-10%20passing-22c55e?style=flat-square)](#development)

[English](README.md) · [简体中文](README.zh.md)

---

Like Codex's global `AGENTS.md` or ChatGPT's Custom Instructions, whatever you write in the **Custom Instructions** panel is carried into every future conversation automatically. Stop repeating yourself in every new chat.

![The Custom Instructions panel in Settings](assets/screenshot.png)

## Contents

- [Why this exists](#why-this-exists)
- [Features](#features)
- [Install](#install)
- [How it works](#how-it-works)
- [Compatibility](#compatibility)
- [Security](#security)
- [Development](#development)
- [License](#license)

## Why this exists

DeepSeek Harness already reads `~/.dsh/AGENTS.md` and injects it into every session's system prompt. What it does not offer is a way to edit that file without leaving the app and finding it on disk.

This plugin adds exactly one thing: a text editor for that file, in Settings. Nothing else changes — no new instruction mechanism, no wrapper, no shadow config.

## Features

| | |
| --- | --- |
| **Global, not per-project** | One file, `~/.dsh/AGENTS.md`, for every session and every model. |
| **Saved straight to disk** | No sync layer, no hidden state — what you save is the file `dsh-agent-instructions` reads. |
| **Works on first use** | `AGENTS.md` doesn't need to exist yet; parent directories are created on first save. |
| **Immediate feedback** | Monospace editor mirrors the file; each save reports success or failure inline. |
| **Zero build** | Hand-written `window.__ModuleLoader__.load` client bundle, pure Node ESM host. Installs without build authorization. |
| **Cross-origin guarded** | Same-origin enforced on the endpoint — see [Security](#security). |

## Install

### From GitHub

```bash
dsh plugin --profile web add github:Demerier/dsh-custom-instructions
```

Restart `dsh web` once so the bundle layer picks it up.

### Manual

If `dsh plugin` isn't available, mount it by hand — three steps.

**1.** Add the dependency to your profile:

```jsonc
// ~/.dsh/profiles/web/package.json
{
  "dependencies": {
    "dsh-custom-instructions": "github:Demerier/dsh-custom-instructions"
  }
}
```

**2.** Add the loader row:

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: custom-instructions
      name: dsh-custom-instructions
```

> Installing via `dsh plugin` does this for you — this repo ships its own `cordis.patch.yml`, so only the dependency line is needed in that case.

**3.** Install and restart:

```bash
cd ~/.dsh/profiles/web && pnpm install
```

Then restart `dsh web`. The panel appears under **Settings → General**.

### Uninstall

```bash
dsh plugin --profile web remove dsh-custom-instructions
```

Your `~/.dsh/AGENTS.md` is left untouched.

## How it works

Three small pieces:

| Layer | File | Responsibility |
| --- | --- | --- |
| **Host** | `lib/index.js` | Registers `GET` / `POST /custom-instructions`. Resolves the target path via `@deepseek-ai/dsh-home-paths` — the same file `dsh-agent-instructions` reads. |
| **Client** | `lib/client.js` | Registers the panel in the `settings.general.item` slot (id `custom-instructions`, `order: -10`). Fetches on open, posts on save. |
| **Bundle** | `cordis.patch.yml` | The loader row that mounts both halves. |

**Why edits take effect without a reload.** The panel writes to the very file `dsh-agent-instructions` already injects. New sessions pick it up from their first message. The current session picks it up after its next `read` / `write` / `edit` file operation — the instruction block is re-read as part of that path.

There is no caching layer to invalidate, and the plugin never touches the prompt itself.

## Compatibility

| DSH version | Status |
| --- | --- |
| `0.2.1-rc.2` | **Verified** on a live instance with an isolated `DSH_HOME` |
| `0.1.x` | Supported |
| `< 0.1.0-rc.6` | Not tested |

DSH 0.2.x broke none of the host contracts this plugin relies on — the `ctx.webServer.register` signature, the `dshHomePath` export, the `settings.general.item` slot, the `__ModuleLoader__` protocol and `react ^18.2.0` are all unchanged. See the contract table in [CHANGELOG.md](CHANGELOG.md).

> **Requires the built-in `dsh-agent-instructions`**, which ships with the `standard` preset by default. If your profile disables it, the panel still edits the file but nothing gets injected.

## Security

`AGENTS.md` lands in the system prompt of **every** session. A page that can rewrite it can therefore steer every conversation you have — prompt injection with extra steps.

Plugin routes are **not** behind the `/api` browser-trust fence. Confirmed on a live instance: `GET /` returns `401` while `GET /custom-instructions` returns `200`. So the endpoint enforces its own guard:

- Requests carrying an `Origin` header must have it match `Host`, or they get **`403`** — reads and writes alike.
- Requests without `Origin` (curl, local scripts) pass through. They cannot be issued cross-site by a browser.

**What this is not:** complete authentication. The host binds `127.0.0.1` by default, so the exposure is limited to local processes. If you run with `--host` on a non-loopback address, put authentication in front of it at the reverse-proxy layer — this plugin will not do it for you.

Other hardening: 1 MiB request-body cap (`413`), `405` responses carry `Allow`, and the client surfaces HTTP status instead of throwing a bare `SyntaxError` on non-JSON error bodies.

## Development

No build step. The client bundle is written directly in DSH's wire format (`window.__ModuleLoader__.load({ id, factory })`).

```bash
node --check lib/index.js       # syntax
node --check lib/client.js      # syntax
node test/contract.test.mjs     # 10 contract tests, no DSH install needed
```

The test suite registers an ESM loader hook that maps `dsh-home-paths` to a temp stub, then drives a real HTTP server through every route — including the cross-origin rejections and the oversized-body path.

| File | Purpose |
| --- | --- |
| `lib/index.js` | Host half — webServer routes, file I/O, origin check |
| `lib/client.js` | Client half — settings panel |
| `cordis.patch.yml` | Bundle patch mounting both |
| `test/contract.test.mjs` | Contract tests |

## License

[MIT](LICENSE).

Forked from [lyke-61/dsh-custom-instructions](https://github.com/lyke-61/dsh-custom-instructions). Adaptation for DSH 0.2.x is documented in [CHANGELOG.md](CHANGELOG.md).
