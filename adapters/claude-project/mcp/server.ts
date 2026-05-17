/**
 * MAS AI Advisor MCP server (Claude Project adapter).
 *
 * Stdio MCP server that the Advisor inside a Claude Project calls for
 * telemetry. Exposes three tools — register_install, record_turn,
 * set_conversation_privacy — each of which proxies a single Advisor API
 * endpoint. The server adds the X-API-Key header so the Advisor never sees
 * the secret.
 *
 * Run with: pnpm mcp:claude-project
 *
 * Required env:
 *   MAS_ADVISOR_API_KEY        Shared API key (same value as Vercel).
 *
 * Optional env:
 *   MAS_ADVISOR_API_BASE_URL   Base URL of the deployed Advisor API.
 *                              Defaults to http://localhost:3000.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import {
  privateBodySchema,
  registerBodySchema,
  turnBodySchema,
} from '@/lib/schemas';

const DEFAULT_BASE_URL = 'http://localhost:3000';

function getApiKey(): string {
  const key = process.env.MAS_ADVISOR_API_KEY;
  if (!key) {
    throw new Error(
      'MAS_ADVISOR_API_KEY is not set. Export it (or place it in the env passed by your MCP client config) before starting the server.',
    );
  }
  return key;
}

function getBaseUrl(): string {
  return process.env.MAS_ADVISOR_API_BASE_URL ?? DEFAULT_BASE_URL;
}

async function postJson(
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': getApiKey(),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Leave as raw text.
    }
  }
  return { status: res.status, body: parsed };
}

function textResult(payload: unknown, isError = false): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: typeof payload === 'string' ? payload : JSON.stringify(payload),
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

async function callAdvisorApi(
  path: string,
  body: unknown,
): Promise<CallToolResult> {
  try {
    const { status, body: responseBody } = await postJson(path, body);
    if (status >= 200 && status < 300) {
      return textResult(responseBody);
    }
    return textResult(
      { error: `advisor api returned ${status}`, response: responseBody },
      true,
    );
  } catch (err) {
    return textResult(
      {
        error: 'advisor api unreachable',
        detail: err instanceof Error ? err.message : String(err),
      },
      true,
    );
  }
}

async function main(): Promise<void> {
  const server = new McpServer(
    {
      name: 'mas-ai-advisor',
      version: '0.1.0',
    },
    {
      capabilities: { tools: {} },
    },
  );

  server.registerTool(
    'register_install',
    {
      description:
        'Submit first-turn consent answers to the MAS Advisor API. Call this once per install, after the Advisor has run the consent script and captured the user\'s yes/no answers to the email and history-sharing questions.',
      inputSchema: registerBodySchema,
    },
    async (args) => callAdvisorApi('/api/install/register', args),
  );

  server.registerTool(
    'record_turn',
    {
      description:
        'Emit a per-turn telemetry event. Call after each substantive turn — but only if the user opted into history sharing (share_history: true) and has not marked this conversation private.',
      inputSchema: turnBodySchema,
    },
    async (args) => callAdvisorApi('/api/conversation/turn', args),
  );

  server.registerTool(
    'set_conversation_privacy',
    {
      description:
        "Set the conversation's privacy state. Required `action` field: 'pause' stops telemetry from this turn forward until a resume; 'resume' re-enables telemetry; 'forget' deletes prior turn events for this conversation and stops telemetry permanently. Always include the action — there is no default.",
      inputSchema: privateBodySchema,
    },
    async (args) => callAdvisorApi('/api/conversation/private', args),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[mas-ai-advisor mcp] fatal:', err);
  process.exit(1);
});
