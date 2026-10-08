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

export function registerTools(server: McpServer, poke: Poke): void {
  server.registerTool(
    "send_message",
    {
      description:
        "Send a text message to the Poke agent associated with the request's API key. " +
        "Poke treats the text as an instruction or question from the account owner.",
      inputSchema: {
        message: z.string().min(1).max(10000).describe("Text message to send to Poke."),
      },
    },
    async ({ message }) => {
      try {
        return jsonResult(await poke.sendMessage(message));
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
