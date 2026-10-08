import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { Poke } from "./poke-sdk";
import { registerTools } from "./tools";

const SERVER_NAME = "poke-mcp";
const SERVER_VERSION = "0.1.0";

interface Env {
  POKE_API_BASE_URL?: string;
}

const ROOT_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>poke-mcp</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font:14px/1.5 system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a"><h1>poke-mcp</h1><p>MCP bridge that lets external agents send messages to <a href="https://poke.com">Poke</a>. Deployed on Cloudflare Workers.</p><p>MCP endpoint: <code>/mcp</code> — requires <code>Authorization: Bearer &lt;poke_api_key&gt;</code></p></body></html>`;

function extractApiKey(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].trim();
  // Poke API keys are issued as "pk_..." at https://poke.com/kitchen/api-keys.
  // Reject anything empty, whitespace-bearing, or implausibly long before it
  // ever reaches the Poke SDK.
  if (token.length < 8 || token.length > 512 || /\s/.test(token)) return null;
  return token;
}

function createServer(apiKey: string, baseUrl?: string): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const poke = new Poke({ apiKey, ...(baseUrl ? { baseUrl } : {}) });
  registerTools(server, poke);
  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("poke-mcp", { status: 200 });
    }

    if (url.pathname === "/") {
      return new Response(ROOT_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const apiKey = extractApiKey(request);
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "missing_or_invalid_bearer_token",
          message: "Provide Authorization: Bearer <poke_api_key> (get one at https://poke.com/kitchen/api-keys)",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const baseUrl = env.POKE_API_BASE_URL?.trim() || undefined;
    return createMcpHandler(() => createServer(apiKey, baseUrl))(request, env as never, ctx);
  },
} satisfies ExportedHandler<Env>;
