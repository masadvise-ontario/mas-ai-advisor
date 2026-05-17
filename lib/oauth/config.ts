/**
 * Derived OAuth provider constants. Reading via getters (not module-load
 * captures) so tests can swap env without re-importing.
 */

export const OAUTH_SCOPE = 'mas-advisor-mcp';
export const OAUTH_ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const OAUTH_AUTHORIZATION_CODE_TTL_SECONDS = 60; // 60 seconds
export const OAUTH_JWT_ALG = 'RS256';
export const OAUTH_JWT_KID = 'mas-advisor-oauth-2026-05';

export function getIssuer(): string {
  const issuer = process.env.MAS_ADVISOR_OAUTH_ISSUER;
  if (!issuer) {
    throw new Error('MAS_ADVISOR_OAUTH_ISSUER not set');
  }
  // Normalize: no trailing slash.
  return issuer.replace(/\/$/, '');
}

export function getMcpResourceUri(): string {
  return `${getIssuer()}/api/mcp`;
}

export function getAuthorizationEndpoint(): string {
  return `${getIssuer()}/oauth/authorize`;
}

export function getTokenEndpoint(): string {
  return `${getIssuer()}/oauth/token`;
}

export function getRegistrationEndpoint(): string {
  return `${getIssuer()}/oauth/register`;
}

export function getJwksUri(): string {
  return `${getIssuer()}/.well-known/jwks.json`;
}

export function getProtectedResourceMetadataUri(): string {
  return `${getIssuer()}/.well-known/oauth-protected-resource`;
}

export function getAuthorizationServerMetadataUri(): string {
  return `${getIssuer()}/.well-known/oauth-authorization-server`;
}
