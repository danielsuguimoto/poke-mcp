# poke-mcp

MCP server on Cloudflare Workers that bridges external agents to [Poke](https://poke.com). Agents connect over Streamable HTTP and send messages to your Poke agent using your Poke API key, via the official [`poke`](https://www.npmjs.com/package/poke) npm SDK.

## How it works

- Stateless MCP server using `createMcpHandler` from `agents/mcp/server` (Streamable HTTP). No Durable Objects, no sessions.
- A fresh `McpServer` and `Poke` client are built per request, so the API key from that request is scoped to that request only.
- The API key is **not stored** on the worker. The MCP client passes `Authorization: Bearer <poke_api_key>` and the worker hands it to the Poke SDK, which calls `https://poke.com/api/v1`.
- Keys are validated before use: they must be a non-empty `Bearer` token (8–512 chars, no whitespace). Anything else gets `401` before reaching the SDK.
- Get your API key at [poke.com/kitchen/api-keys](https://poke.com/kitchen/api-keys).

## Tools

| Tool | Maps to | Description |
|------|---------|-------------|
| `send_message` | `poke.sendMessage(text)` | Send a text message to your Poke agent. Attributes the message to the calling agent, tags it with a `taskId`, and returns that `taskId` |
| `check_task` | `poke.sendMessage(text)` | Ask Poke for the progress or result of a task by its `taskId` |
| `create_webhook` | `poke.createWebhook({condition, action})` | Create a Poke webhook trigger; returns `webhookUrl` + `webhookToken` |
| `send_webhook` | `poke.sendWebhook({webhookUrl, webhookToken, data})` | Fire a webhook trigger with a JSON payload |

Progress tracking follows the Pally MCP pattern: `send_message` tags each request with a `taskId` and tells Poke to report status for it; `check_task` later asks Poke for that task's progress. The worker stays stateless — Poke itself holds the task state. Sender attribution uses the optional `agent_name` argument, falling back to the MCP client's reported name.

## Endpoints

- `POST /mcp` — MCP Streamable HTTP endpoint (requires `Authorization: Bearer <poke_api_key>`)
- `GET /` — info page
- `GET /health` — health check

## Setup

```bash
npm install
npm run dev        # local dev on http://localhost:8787
npm run typecheck  # tsc --noEmit
npm test           # node:test tool tests
```

Requires Node.js >= 18 (Node 22 recommended).

## Deploy to Cloudflare Workers

```bash
npx wrangler login   # one-time Cloudflare auth
npm run deploy       # wrangler deploy
```

`wrangler.jsonc` already sets `nodejs_compat` (required — the `poke` SDK bundle imports `node:*` builtins even though `sendMessage` only needs `fetch`).

### Note: which `poke` bundle is used

The package's ESM entry (`dist/index.mjs`) executes `createRequire(import.meta.url)` at module scope, which throws in the Workers runtime (`import.meta.url` is undefined → Cloudflare error 10021). Its `exports` map also blocks the bare `poke/dist/index.cjs` specifier. `src/poke-sdk.ts` therefore imports the CommonJS bundle by relative path and `src/node-shims.ts` defines the `__filename`/`__dirname` globals workerd lacks (only referenced by the `poke login` browser-open code path, which a Worker never runs). Same official SDK, same API — only the module entry differs.

### Optional: override the Poke API base URL

By default the SDK calls `https://poke.com/api/v1`. To point elsewhere (e.g. staging), add to `wrangler.jsonc`:

```jsonc
"vars": { "POKE_API_BASE_URL": "https://poke.com/api/v1" }
```

## Connect a client

Point any MCP client that supports remote servers at the deployed worker:

```
URL:   https://poke-mcp.<your-subdomain>.workers.dev/mcp
Auth:  Bearer <poke_api_key>
```

Example with the `poke` CLI itself (once deployed):

```bash
poke mcp add https://poke-mcp.<your-subdomain>.workers.dev/mcp --name "poke-mcp" --api-key pk_...
```

## Security notes

- Never commit your API key — there is no `.dev.vars` secret needed; auth is per-request via the `Authorization` header.
- Every caller needs a valid Poke API key; the worker adds no shared credential, so exposing the URL does not expose your account.
- Consider restricting access further (e.g. Cloudflare Access) if the worker URL may be shared.
