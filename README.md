# Rofiant

Rofiant is a native desktop AI chat app, built on Tauri (Rust + React/TypeScript) for macOS, Windows, and Linux.

It's a chat client that goes beyond a simple prompt box: it can read and edit files on your machine with a reviewable diff history, connect to local or hosted language models, extend itself with external tools over the Model Context Protocol (MCP), and run entirely offline against a local Ollama server if you don't want to depend on a hosted provider.

## Features

- **Chat with multiple models** — hosted models (GPT-OSS 20B/120B, Llama 3.1 8B Instant, Qwen 3.6 27B, and more) or any model served locally through [Ollama](https://ollama.com), with no code required to switch between them.
- **File editing with diff review** — the assistant can propose file changes; every change is shown as a diff before/after it lands, with a full history you can revisit or roll back.
- **Ask / Plan modes** — switch to Plan mode to get a step-by-step plan for approval before any file changes are made, similar to how coding agents like Claude Code work.
- **MCP support** — connect stdio-based [Model Context Protocol](https://modelcontextprotocol.io) servers (filesystem, git, databases, or anything else exposing MCP tools) and use their tools directly from chat.
- **Custom agents & rules** — define reusable personas with their own system prompts, and persistent instructions ("rules") that apply across conversations.
- **Account sync** — sign in to sync conversations across devices, with optional two-factor authentication (TOTP).
- **Privacy-respecting telemetry** — anonymous, opt-out product analytics; no telemetry data is ever readable back by the client.

## Getting started

```bash
pnpm install
pnpm dev       # starts the Tauri dev app with hot reload
```

### Building

```bash
pnpm build     # typecheck + build the frontend
```

Building the full desktop app (with native bundling) is driven by the Tauri CLI — see [`src-tauri/`](./src-tauri) and the CI workflows in [`.github/workflows`](./.github/workflows) for the exact per-platform build steps.

### Requirements

- [Node.js](https://nodejs.org) 22+ and [pnpm](https://pnpm.io)
- [Rust](https://www.rust-lang.org) (stable toolchain) and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform
- Optionally, a running [Ollama](https://ollama.com) instance if you want to use local models

## License

Rofiant is licensed under the [GNU General Public License v3.0](./LICENSE).
