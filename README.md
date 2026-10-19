# dsh-custom-instructions

Codex-style custom instructions for **DeepSeek Harness**: edit a **global instruction** from the settings panel that applies to every conversation on this machine, across all models.

> Forked from [lyke-61/dsh-custom-instructions](https://github.com/lyke-61/dsh-custom-instructions) (MIT), adapted for **DeepSeek Harness 0.2.x** (verified on `0.2.1-rc.2`) while staying compatible with 0.1.x. See [CHANGELOG.md](CHANGELOG.md).

Just like Codex's global `AGENTS.md` or ChatGPT's Custom Instructions, the notes and context you write in the "Custom Instructions" panel are automatically carried into every future conversation — no need to repeat yourself in every message.

![Custom Instructions panel in Settings](assets/screenshot.png)

## Features

- **Codex-style custom instructions**: Settings → General → "Custom Instructions", edits `~/.dsh/AGENTS.md`, saved straight to disk.
- **Applies to every session and every model**: built on DSH's built-in `dsh-agent-instructions` mechanism — new conversations pick it up from the first message; the current conversation picks it up after the next file operation.
- **Works on first use**: saving succeeds even when `AGENTS.md` never existed (parent dirs are created).
- **CSRF-guarded**: the endpoint enforces same-origin; cross-site requests get 403 — this file is injected into every session's system prompt, so arbitrary web pages must not be able to rewrite it.
- **WYSIWYG**: monospace editor mirrors the file content; saving gives immediate success/failure feedback.
- **Zero build**: hand-written `window.__ModuleLoader__.load` client bundle + pure Node ESM host — no build authorization needed to install.

## Install

### From GitHub (this repo)

```bash
dsh plugin --profile web add github:Demerier/dsh-custom-instructions
```

Then restart `dsh web` once so the bundle layer loads.

### Manual (edit profile files)

1. Add the dependency:

```jsonc
// ~/.dsh/profiles/web/package.json
{
  "dependencies": {
    "dsh-custom-instructions": "github:Demerier/dsh-custom-instructions"
  }
}
```

2. Add the plugin row (this repo ships its own `cordis.patch.yml` — either merge its row into your profile's `cordis.patch.yml`, or install via the `dsh plugin` command above which does it for you):

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: custom-instructions
      name: dsh-custom-instructions
```

3. Run `pnpm install` in the profile directory, then restart `dsh web`.

## How it works

| Layer | File | What it does |
| --- | --- | --- |
| Host | `lib/index.js` | Registers `GET/POST /custom-instructions` routes on the webServer to read/write `~/.dsh/AGENTS.md`; the path is resolved via `@deepseek-ai/dsh-home-paths` — the same file `dsh-agent-instructions` reads |
| Client | `lib/client.js` | Registers the "Custom Instructions" panel in the General settings slot (`settings.general.item`, id `custom-instructions`, right below "Permissions"); loads content via `fetch` on open, saves via `POST` |
| Bundle | `cordis.patch.yml` | The loader row that mounts both halves |

**Effect mechanism**: the panel edits the very global-instruction file `dsh-agent-instructions` injects into every session, so the plugin needs no hot-reload of its own — new sessions see it immediately; the current session picks it up after the next `read` / `write` / `edit` file operation.

## Compatibility

- **DeepSeek Harness `0.2.1-rc.2`: verified** (0.1.x still works).
- 0.2.x broke none of the host contracts this plugin relies on: the `ctx.webServer.register` signature, the `dshHomePath` export, the `settings.general.item` slot, the `__ModuleLoader__` protocol, and `react ^18.2.0` are all unchanged.
- Depends on the built-in `dsh-agent-instructions` (shipped with the `standard` preset by default); if your profile disables it, the instructions won't be injected.

## Development

The client bundle is hand-written in the exact wire format (`window.__ModuleLoader__.load({ id, factory })`), so no build step is required:

```bash
node --check lib/index.js
node --check lib/client.js
node test/contract.test.mjs   # 10 contract tests, no DSH install required
```

## License

MIT
