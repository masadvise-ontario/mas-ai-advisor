/**
 * Dynamic Client Registration (RFC 7591).
 *
 * Public endpoint — claude.ai (and any other DCR-capable MCP client) POSTs
 * here on first connection to claim a client_id. No auth, no client_secret;
 * public clients only (PKCE protects the flow).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/oauth/clients';
import { OAUTH_SCOPE } from '@/lib/oauth/config';

export const runtime = 'nodejs';

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
  const parsed = registerSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return err(400, 'invalid_client_metadata', 'malformed request body');
  }
  const c = parsed.data;

  if (
    c.grant_types &&
    !c.grant_types.every((g) => g === 'authorization_code')
  ) {
    return err(
      400,
      'invalid_client_metadata',
      'only the authorization_code grant_type is supported',
    );
  }
  if (c.response_types && !c.response_types.every((r) => r === 'code')) {
    return err(
      400,
      'invalid_client_metadata',
      'only response_type=code is supported',
    );
  }

  const client = await createClient({
    client_name: c.client_name,
    redirect_uris: c.redirect_uris,
    grant_types: c.grant_types,
    response_types: c.response_types,
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
