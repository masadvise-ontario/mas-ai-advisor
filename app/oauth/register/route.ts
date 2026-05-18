/**
 * Dynamic Client Registration (RFC 7591).
 *
 * Public endpoint — claude.ai (and any other DCR-capable MCP client) POSTs
 * here on first connection to claim a client_id. No auth, no client_secret;
 * public clients only (PKCE protects the flow).
 *
 * Per RFC 7591 §3.2.1, when the server doesn't support every requested
 * grant_type or response_type, it MAY register the client with only the
 * supported subset and reflect that in the response — we do this rather
 * than rejecting, so clients like claude.ai (which request `refresh_token`
 * alongside `authorization_code`) succeed. The actual `refresh_token`
 * grant attempt would be rejected at /oauth/token; clients infer
 * "no refresh tokens supported" from this response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/oauth/clients';
import { OAUTH_SCOPE } from '@/lib/oauth/config';

export const runtime = 'nodejs';

const SUPPORTED_GRANT_TYPES = ['authorization_code'] as const;
const SUPPORTED_RESPONSE_TYPES = ['code'] as const;

const registerSchema = z
  .object({
    client_name: z.string().min(1).max(200),
    redirect_uris: z.array(z.string().url()).min(1).max(10),
    grant_types: z.array(z.string()).optional(),
    response_types: z.array(z.string()).optional(),
    scope: z.string().optional(),
  })
  // Per RFC 7591 §3.1, ignore unknown metadata rather than failing.
  .passthrough();

function err(status: number, error: string, description: string) {
  return NextResponse.json(
    { error, error_description: description },
    { status },
  );
}

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    // Log the rejection so we can diagnose unexpected client shapes.
    console.warn('[oauth/register] invalid body', {
      raw,
      issues: parsed.error.flatten(),
    });
    return err(400, 'invalid_client_metadata', 'malformed request body');
  }
  const c = parsed.data;

  // Filter rather than reject: the client may request grant_types or
  // response_types we don't support (e.g. refresh_token). We register
  // them with only the subset we do support; the response reflects that.
  const grantTypes = (c.grant_types ?? [...SUPPORTED_GRANT_TYPES]).filter(
    (g) => (SUPPORTED_GRANT_TYPES as readonly string[]).includes(g),
  );
  if (grantTypes.length === 0) grantTypes.push('authorization_code');

  const responseTypes = (
    c.response_types ?? [...SUPPORTED_RESPONSE_TYPES]
  ).filter((r) => (SUPPORTED_RESPONSE_TYPES as readonly string[]).includes(r));
  if (responseTypes.length === 0) responseTypes.push('code');

  const client = await createClient({
    client_name: c.client_name,
    redirect_uris: c.redirect_uris,
    grant_types: grantTypes,
    response_types: responseTypes,
    scope: c.scope ?? OAUTH_SCOPE,
  });

  return NextResponse.json(
    {
      client_id: client.client_id,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      grant_types: client.grant_types,
      response_types: client.response_types,
      token_endpoint_auth_method: client.token_endpoint_auth_method,
      scope: client.scope,
      client_id_issued_at: Math.floor(client.created_at.getTime() / 1000),
    },
    { status: 201 },
  );
}
