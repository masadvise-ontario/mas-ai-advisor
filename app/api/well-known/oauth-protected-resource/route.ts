/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728).
 *
 * Tells MCP clients where to find the authorization server that protects
 * /api/mcp. Reached via the /.well-known/oauth-protected-resource rewrite.
 */

import { NextResponse } from 'next/server';
import {
  OAUTH_SCOPE,
  getIssuer,
  getMcpResourceUri,
} from '@/lib/oauth/config';

export const runtime = 'nodejs';

export function GET() {
  // Per RFC 9728 §2: authorization_servers is a list of issuer identifiers
  // (i.e., the issuer base URL, e.g. https://mas-ai-advisor.vercel.app),
  // NOT the metadata URL. Clients derive the metadata URL themselves by
  // appending /.well-known/oauth-authorization-server to the issuer.
  const body = {
    resource: getMcpResourceUri(),
    authorization_servers: [getIssuer()],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ['header'],
  };
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  });
}
