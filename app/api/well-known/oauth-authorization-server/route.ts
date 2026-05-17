/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 *
 * Reached via the /.well-known/oauth-authorization-server rewrite. Public,
 * unauthenticated. Cached for 5 minutes — the contents change rarely
 * (only when we rotate signing keys or add/remove grant types).
 */

import { NextResponse } from 'next/server';
import {
  OAUTH_JWT_ALG,
  getAuthorizationEndpoint,
  getIssuer,
  getJwksUri,
  getRegistrationEndpoint,
  getTokenEndpoint,
} from '@/lib/oauth/config';

export const runtime = 'nodejs';

export function GET() {
  const body = {
    issuer: getIssuer(),
    authorization_endpoint: getAuthorizationEndpoint(),
    token_endpoint: getTokenEndpoint(),
    registration_endpoint: getRegistrationEndpoint(),
    jwks_uri: getJwksUri(),
    scopes_supported: ['mas-advisor-mcp'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    id_token_signing_alg_values_supported: [OAUTH_JWT_ALG],
  };
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  });
}
