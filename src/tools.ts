import type { McpServer } from "@modelcontextprotocol/server";
import type { Poke } from "poke";
import { z } from "zod";

function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

function taskPrompt(taskId: string, sender: string, message: string): string {
  return (
    `[poke-mcp] This message was sent by the AI agent "${sender}" through the poke-mcp MCP server.\n` +
    `Task ID: ${taskId}\n` +
    `Treat this message as a task. If you later receive a message asking for progress on this Task ID, ` +
    `report the current status and any result.\n\n` +
    message
  );
}

export function registerTools(server: McpServer, poke: Poke): void {
  server.registerTool(
    "send_message",
    {
      description:
        "Send a text message to the Poke agent associated with the request's API key. " +
        "The message is attributed to the sending agent and carries a taskId; the " +
        "returned taskId can be passed to check_task to ask Poke for progress.",
      inputSchema: {
        message: z.string().min(1).max(10000).describe("Text message to send to Poke."),
        agent_name: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe("Your name as the sending agent. Required because this server is stateless."),
      },
    },
    async ({ message, agent_name }) => {
      try {
        const taskId = crypto.randomUUID();
        const sender = agent_name;
        const response = await poke.sendMessage(taskPrompt(taskId, sender, message));
        return jsonResult({ taskId, sender, response });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "check_task",
    {
      description:
        "Ask Poke for the progress or result of a task previously sent with send_message. " +
        "Pass the taskId returned by send_message. Poke is stateful, so it answers from " +
        "its own memory of the task.",
      inputSchema: {
        task_id: z.string().min(1).describe("taskId returned by send_message."),
        note: z
          .string()
          .min(1)
          .max(2000)
          .optional()
          .describe("Optional extra question or context for the status check."),
        agent_name: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe("Your name as the sending agent. Required because this server is stateless."),
      },
    },
    async ({ task_id, note, agent_name }) => {
      try {
        const sender = agent_name;
        const prompt =
          `[poke-mcp] Progress check from agent "${sender}" via the poke-mcp MCP server.\n` +
          `What is the current status or result of Task ID ${task_id}?` +
          (note ? `\n${note}` : "");
        const response = await poke.sendMessage(prompt);
        return jsonResult({ taskId: task_id, sender, response });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "create_webhook",
    {
      description:
        "Create a Poke webhook trigger. Returns a webhookUrl and webhookToken that can be " +
        "fired later with the send_webhook tool (or any HTTP client) when condition is met.",
      inputSchema: {
        condition: z.string().min(1).max(2000).describe("When the webhook should fire, in natural language."),
        action: z.string().min(1).max(2000).describe("What Poke should do when the webhook fires."),
      },
    },
    async ({ condition, action }) => {
      try {
        return jsonResult(await poke.createWebhook({ condition, action }));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "send_webhook",
    {
      description:
        "Fire a Poke webhook trigger with a JSON data payload, using the webhookUrl and " +
        "webhookToken returned by create_webhook.",
      inputSchema: {
        webhookUrl: z.string().url().describe("webhookUrl returned by create_webhook."),
        webhookToken: z.string().min(1).describe("webhookToken returned by create_webhook."),
        data: z.record(z.string(), z.unknown()).describe("JSON payload delivered to the webhook trigger."),
      },
    },
    async ({ webhookUrl, webhookToken, data }) => {
      try {
        return jsonResult(await poke.sendWebhook({ webhookUrl, webhookToken, data }));
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
