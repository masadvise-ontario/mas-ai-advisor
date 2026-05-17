import type { NextRequest } from 'next/server';

export type AuthCheck = { ok: true } | { ok: false; reason: string };

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

/**
 * Bearer-token auth for the MCP endpoint.
 *
 * PR 1 (this PR) uses the existing MAS_ADVISOR_API_KEY as the bearer token —
 * a transitional placeholder. PR 2 replaces this with OAuth 2.1 bearer JWTs
 * issued by the in-repo OAuth provider; see the spec's "MCP transport +
 * authorization" locked decision.
 */
export function checkBearerToken(req: Request | NextRequest): AuthCheck {
  const expected = process.env.MAS_ADVISOR_API_KEY;
  if (!expected) {
    return { ok: false, reason: 'server misconfigured: missing api key' };
  }
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, reason: 'missing bearer token' };
  }
  if (match[1] !== expected) {
    return { ok: false, reason: 'invalid bearer token' };
  }
  return { ok: true };
}
