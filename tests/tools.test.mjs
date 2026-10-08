import assert from "node:assert/strict";
import { test } from "node:test";
import { McpServer } from "@modelcontextprotocol/server";
import { Poke } from "../src/poke-sdk.ts";
import { registerTools } from "../src/tools.ts";

async function createServer(t) {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerTools(server, new Poke({ apiKey: "pk_test_dummy" }));
  const pending = new Map();
  const transport = {
    async start() {},
    async close() {},
    async send(message) {
      if (pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      }
    },
  };
  await server.connect(transport);
  t.after(() => server.close());
  let id = 0;
  function request(method, params = {}) {
    return new Promise((resolve) => {
      pending.set(++id, resolve);
      transport.onmessage({ jsonrpc: "2.0", id, method, params });
    });
  }
  await request("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0.0" },
  });
  transport.onmessage({ jsonrpc: "2.0", method: "notifications/initialized" });
  return { request };
}

test("exposes send_message, create_webhook, and send_webhook tools", async (t) => {
  const { request } = await createServer(t);
  const { result } = await request("tools/list");
  const names = result.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, ["create_webhook", "send_message", "send_webhook"]);
});

test("send_message validates its input", async (t) => {
  const { request } = await createServer(t);
  const res = await request("tools/call", { name: "send_message", arguments: {} });
  assert.equal(res.result?.isError, true);
});
