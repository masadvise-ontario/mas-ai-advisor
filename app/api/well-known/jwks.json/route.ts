/**
 * JWKS endpoint (RFC 7517) — publishes the OAuth signing public key so
 * downstream MCP clients (or any party verifying our access tokens) can
 * fetch it. Reached via the /.well-known/jwks.json rewrite.
 */

import { NextResponse } from 'next/server';
import { getJwks } from '@/lib/oauth/keys';

export const runtime = 'nodejs';

export async function GET() {
  const jwks = await getJwks();
  return NextResponse.json(jwks, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  });
}
