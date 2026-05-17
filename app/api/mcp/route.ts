/**
 * MAS AI Advisor — streamable-HTTP MCP endpoint.
 *
 * Replaces the original stdio adapter (deprecated 2026-05-17 — see spec
 * "MCP transport + authorization" locked decision). claude.ai web custom
 * connectors require a remote HTTPS MCP endpoint; this is that endpoint.
 *
 * Exposes three tools that proxy the three Advisor API handlers:
 *   - register_install
 *   - record_turn
 *   - set_conversation_privacy
 *
 * Auth (PR 1, transitional): Authorization: Bearer <MAS_ADVISOR_API_KEY>.
 * Auth (PR 2): OAuth 2.1 bearer JWT issued by the in-repo provider layer
 * (Auth.js + .well-known/* + /oauth/{authorize,token,register}).
 */

import type { NextRequest } from 'next/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { checkBearerToken } from '@/lib/auth';
import {
  registerInstall,
  recordTurn,
  setConversationPrivacy,
  UnknownInstallError,
} from '@/lib/handlers';
import {
  registerBodySchema,
  turnBodySchema,
  privateBodySchema,
  type RegisterBody,
  type TurnBody,
  type PrivateBody,
} from '@/lib/schemas';

export const runtime = 'nodejs';

function unauthorized(reason: string): Response {
  return new Response(JSON.stringify({ error: reason }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      // OAuth 2.0 bearer-token challenge (RFC 6750). PR 2 will extend this
      // with the resource_metadata pointer per RFC 9728.
      'WWW-Authenticate': 'Bearer realm="MAS Advisor MCP"',
    },
  });
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

function errorResult(err: unknown): CallToolResult {
  if (err instanceof UnknownInstallError) {
    return textResult({ error: 'unknown install_id', install_id: err.install_id }, true);
  }
  return textResult(
    {
      error: 'server error',
      detail: err instanceof Error ? err.message : String(err),
    },
    true,
  );
}

function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'mas-ai-advisor', version: '0.2.0' },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    'register_install',
    {
      description:
        "Submit first-turn consent answers to the MAS Advisor. Call this once per install, after the Advisor has run the consent script and captured the user's answers about email collection and conversation-history sharing.",
      inputSchema: registerBodySchema,
    },
    async (args: RegisterBody) => {
      try {
        const result = await registerInstall(args);
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'record_turn',
    {
      description:
        'Emit a per-turn telemetry event. Call after each substantive turn — but only if the user opted into history sharing (share_history: true) and has not marked this conversation private.',
      inputSchema: turnBodySchema,
    },
    async (args: TurnBody) => {
      try {
        const result = await recordTurn(args);
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'set_conversation_privacy',
    {
      description:
        "Set the conversation's privacy state. Required `action` field: 'pause' stops telemetry from this turn forward until a resume; 'resume' re-enables telemetry; 'forget' deletes prior turn events for this conversation and stops telemetry permanently. Always include the action — there is no default.",
      inputSchema: privateBodySchema,
    },
    async (args: PrivateBody) => {
      try {
        const result = await setConversationPrivacy(args);
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  return server;
}

async function handle(req: Request): Promise<Response> {
  const auth = checkBearerToken(req);
  if (!auth.ok) {
    return unauthorized(auth.reason);
  }

  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless: Vercel serverless instances don't share memory across cold
    // starts, and the Advisor doesn't need session continuity for these tools.
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function DELETE(req: NextRequest) {
  return handle(req);
}
