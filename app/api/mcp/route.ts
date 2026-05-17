/**
 * MAS AI Advisor — streamable-HTTP MCP endpoint.
 *
 * OAuth 2.1 protected (PR #13). Tokens issued by the in-repo OAuth
 * provider (/oauth/token), verified against /.well-known/jwks.json.
 *
 * Tools exposed:
 *   - get_user_identity        (read-only; returns OAuth email)
 *   - register_install         (mutation)
 *   - record_turn              (mutation)
 *   - set_conversation_privacy (mutation; action: pause|resume|forget)
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

import { verifyMcpAuth } from '@/lib/auth';
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
import { getProtectedResourceMetadataUri } from '@/lib/oauth/config';

export const runtime = 'nodejs';

function unauthorized(reason: string): Response {
  // RFC 9728 — the resource_metadata pointer lets the client discover the
  // authorization server without a separate config step.
  const challenge = `Bearer realm="MAS Advisor MCP", resource_metadata="${getProtectedResourceMetadataUri()}"`;
  return new Response(JSON.stringify({ error: 'unauthorized', reason }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': challenge,
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
    return textResult(
      { error: 'unknown install_id', install_id: err.install_id },
      true,
    );
  }
  return textResult(
    {
      error: 'server error',
      detail: err instanceof Error ? err.message : String(err),
    },
    true,
  );
}

type ToolExtra = {
  authInfo?: AuthInfo;
};

function emailFromAuth(extra: ToolExtra): string | null {
  const e = extra.authInfo?.extra;
  if (e && typeof (e as Record<string, unknown>).email === 'string') {
    return (e as Record<string, unknown>).email as string;
  }
  return null;
}

function emailVerifiedFromAuth(extra: ToolExtra): boolean {
  const e = extra.authInfo?.extra;
  if (e && typeof (e as Record<string, unknown>).email_verified === 'boolean') {
    return (e as Record<string, unknown>).email_verified as boolean;
  }
  return false;
}

function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'mas-ai-advisor', version: '0.3.0' },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    'get_user_identity',
    {
      description:
        "Return the OAuth-verified identity of the signed-in user (email + verification flag). Call this at the start of the first-turn consent script so you can read the user's email back to them before asking for consent. No arguments.",
      inputSchema: z.object({}),
    },
    async (_args, extra) => {
      const email = emailFromAuth(extra as ToolExtra);
      if (!email) {
        return textResult(
          { error: 'no OAuth identity attached to this request' },
          true,
        );
      }
      return textResult({
        email,
        email_verified: emailVerifiedFromAuth(extra as ToolExtra),
      });
    },
  );

  server.registerTool(
    'register_install',
    {
      description:
        "Submit first-turn consent answers to the MAS Advisor. Call this once per install, after the user has answered the share_history question. If `email` is omitted, the verified OAuth email is used (per the user's 'use this' consent). If `email` is provided, that override is stored (per the user's 'different' consent). If `email_decline: true` is set, no email is stored (per the user's 'decline' consent).",
      inputSchema: registerBodySchema,
    },
    async (args: RegisterBody, extra) => {
      try {
        const oauthEmail = emailFromAuth(extra as ToolExtra);
        // Email resolution: explicit override > OAuth email > null.
        const resolvedEmail =
          args.email_decline === true
            ? null
            : (args.email ?? oauthEmail ?? null);
        const result = await registerInstall({
          ...args,
          email: resolvedEmail,
        });
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
  const auth = await verifyMcpAuth(req);
  if (!auth.ok) {
    return unauthorized(auth.reason);
  }

  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  return transport.handleRequest(req, { authInfo: auth.authInfo });
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
