import type { NextRequest } from 'next/server';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { InvalidAccessTokenError, verifyAccessToken } from '@/lib/oauth/jwt';

export type AuthCheck = { ok: true } | { ok: false; reason: string };

/**
 * X-API-Key check for the legacy REST endpoints
 * (POST /api/install/register, /api/conversation/turn, /api/conversation/private).
 *
 * These routes are kept for non-OAuth platform adapters (Custom GPT Action,
 * Copilot connector, Gemini click-out). The MCP route uses OAuth instead;
 * see verifyMcpAuth below.
 */
export function checkApiKey(req: NextRequest): AuthCheck {
  const expected = process.env.MAS_ADVISOR_API_KEY;
  if (!expected) {
    return { ok: false, reason: 'server misconfigured: missing api key' };
  }
  const provided = req.headers.get('x-api-key');
  if (!provided || provided !== expected) {
    return { ok: false, reason: 'unauthorized' };
  }
  return { ok: true };
}

export type McpAuthCheck =
  | { ok: true; authInfo: AuthInfo }
  | { ok: false; reason: string };

/**
 * OAuth 2.1 bearer-token verification for the MCP endpoint.
 *
 * Validates the JWT against our own public key (the OAuth provider in this
 * same repo issues these tokens). Returns an MCP-SDK-shaped AuthInfo on
 * success, with the verified user identity stashed in `extra` so tool
 * handlers can read it.
 */
export async function verifyMcpAuth(
  req: Request | NextRequest,
): Promise<McpAuthCheck> {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, reason: 'missing bearer token' };
  }
  try {
    const claims = await verifyAccessToken(match[1]);
    const audValue = Array.isArray(claims.aud) ? claims.aud[0] : claims.aud;
    const authInfo: AuthInfo = {
      token: match[1],
      clientId: claims.client_id,
      scopes: typeof claims.scope === 'string' ? claims.scope.split(' ').filter(Boolean) : [],
      expiresAt: claims.exp,
      resource: typeof audValue === 'string' ? new URL(audValue) : undefined,
      extra: {
        email: claims.email,
        email_verified: claims.email_verified,
        sub: claims.sub,
      },
    };
    return { ok: true, authInfo };
  } catch (err) {
    if (err instanceof InvalidAccessTokenError) {
      return { ok: false, reason: err.reason };
    }
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'invalid token',
    };
  }
}
