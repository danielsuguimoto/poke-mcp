import assert from "node:assert/strict";
import { test } from "node:test";
import { McpServer } from "@modelcontextprotocol/server";
import { Poke } from "../src/poke-sdk.ts";
import { registerTools } from "../src/tools.ts";

async function createServer(t, { poke = new Poke({ apiKey: "pk_test_dummy" }), initialize = true } = {}) {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerTools(server, poke);
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
  if (initialize) {
    await request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0.0" },
    });
    transport.onmessage({ jsonrpc: "2.0", method: "notifications/initialized" });
  }
  return { request };
}

test("exposes send_message, check_task, create_webhook, and send_webhook tools", async (t) => {
  const { request } = await createServer(t);
  const { result } = await request("tools/list");
  const names = result.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, ["check_task", "create_webhook", "send_message", "send_webhook"]);
  for (const name of ["send_message", "check_task"]) {
    assert.ok(result.tools.find((tool) => tool.name === name).inputSchema.required.includes("agent_name"));
  }
});

test("send_message validates its input", async (t) => {
  const { request } = await createServer(t);
  const res = await request("tools/call", { name: "send_message", arguments: {} });
  assert.equal(res.result?.isError, true);
});

for (const name of ["send_message", "check_task"]) {
  test(`${name} rejects missing, blank, and oversized agent names without contacting Poke`, async (t) => {
    const messages = [];
    const poke = { async sendMessage(message) { messages.push(message); } };
    const { request } = await createServer(t, { poke });
    const args = name === "send_message" ? { message: "Summarize this" } : { task_id: "task-123" };
    for (const agent_name of [undefined, "", " \t\n ", "a".repeat(201)]) {
      const { result } = await request("tools/call", { name, arguments: { ...args, agent_name } });
      assert.equal(result.isError, true);
    }
    assert.deepEqual(messages, []);
  });
}

test("send_message and check_task preserve attribution and the task ID across fresh servers", async (t) => {
  const messages = [];
  const response = { success: true };
  const poke = { async sendMessage(message) { messages.push(message); return response; } };
  const send = await createServer(t, { poke, initialize: false });
  const sent = await send.request("tools/call", {
    name: "send_message",
    arguments: { message: "Summarize this", agent_name: "  Research Agent  " },
  });
  assert.notEqual(sent.result.isError, true);
  const task = JSON.parse(sent.result.content[0].text);
  assert.match(task.taskId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(task.sender, "Research Agent");
  assert.deepEqual(task.response, response);
  assert.ok(messages[0].startsWith('[poke-mcp] This message was sent by the AI agent "Research Agent"'));
  assert.ok(messages[0].includes(`Task ID: ${task.taskId}\n`));
  assert.ok(messages[0].endsWith("\n\nSummarize this"));

  for (const note of [undefined, "Include any partial results."]) {
    const check = await createServer(t, { poke, initialize: false });
    const checked = await check.request("tools/call", {
      name: "check_task",
      arguments: { task_id: task.taskId, agent_name: "  Research Agent  ", ...(note ? { note } : {}) },
    });
    assert.notEqual(checked.result.isError, true);
    assert.deepEqual(JSON.parse(checked.result.content[0].text), task);
    assert.equal(messages.at(-1),
      '[poke-mcp] Progress check from agent "Research Agent" via the poke-mcp MCP server.\n' +
      `What is the current status or result of Task ID ${task.taskId}?` + (note ? `\n${note}` : ""));
  }
  assert.equal(messages.length, 3);
});

test("send_message generates a different ID for each task", async (t) => {
  const poke = { async sendMessage() { return { success: true }; } };
  const { request } = await createServer(t, { poke });
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const { result } = await request("tools/call", {
      name: "send_message", arguments: { message: "Summarize this", agent_name: "Research Agent" },
    });
    ids.push(JSON.parse(result.content[0].text).taskId);
  }
  assert.notEqual(ids[0], ids[1]);
});

for (const name of ["send_message", "check_task"]) {
  test(`${name} reports Poke errors`, async (t) => {
    const poke = { async sendMessage() { throw new Error("Poke unavailable"); } };
    const { request } = await createServer(t, { poke });
    const args = name === "send_message" ? { message: "Summarize this" } : { task_id: "task-123" };
    const { result } = await request("tools/call", {
      name, arguments: { ...args, agent_name: "Research Agent" },
    });
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, "Poke unavailable");
  });
}
