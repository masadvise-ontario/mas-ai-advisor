/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728).
 *
 * Tells MCP clients where to find the authorization server that protects
 * /api/mcp. Reached via the /.well-known/oauth-protected-resource rewrite.
 */

import { NextResponse } from 'next/server';
import {
  OAUTH_SCOPE,
  getAuthorizationServerMetadataUri,
  getMcpResourceUri,
} from '@/lib/oauth/config';

export const runtime = 'nodejs';

export function GET() {
  const body = {
    resource: getMcpResourceUri(),
    authorization_servers: [getAuthorizationServerMetadataUri()],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ['header'],
  };
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  });
}
