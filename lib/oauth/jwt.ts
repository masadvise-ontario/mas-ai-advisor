import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import {
  OAUTH_ACCESS_TOKEN_TTL_SECONDS,
  OAUTH_JWT_ALG,
  OAUTH_JWT_KID,
  getIssuer,
  getMcpResourceUri,
} from './config';
import { getPrivateKey, getPublicKey } from './keys';

export type AccessTokenClaims = JWTPayload & {
  sub: string;
  email: string;
  email_verified: boolean;
  client_id: string;
  scope: string;
};

export async function signAccessToken(claims: {
  sub: string;
  email: string;
  email_verified: boolean;
  client_id: string;
  scope: string;
  audience?: string;
}): Promise<string> {
  const key = await getPrivateKey();
  return await new SignJWT({
    email: claims.email,
    email_verified: claims.email_verified,
    client_id: claims.client_id,
    scope: claims.scope,
  })
    .setProtectedHeader({ alg: OAUTH_JWT_ALG, kid: OAUTH_JWT_KID })
    .setSubject(claims.sub)
    .setIssuer(getIssuer())
    .setAudience(claims.audience ?? getMcpResourceUri())
    .setIssuedAt()
    .setExpirationTime(`${OAUTH_ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(key);
}

export class InvalidAccessTokenError extends Error {
  constructor(public reason: string) {
    super(`invalid access token: ${reason}`);
    this.name = 'InvalidAccessTokenError';
  }
}

export async function verifyAccessToken(
  token: string,
  opts: { audience?: string } = {},
): Promise<AccessTokenClaims> {
  const key = await getPublicKey();
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: getIssuer(),
      audience: opts.audience ?? getMcpResourceUri(),
      algorithms: [OAUTH_JWT_ALG],
    });
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new InvalidAccessTokenError('missing sub');
    }
    if (typeof payload.email !== 'string' || !payload.email) {
      throw new InvalidAccessTokenError('missing email');
    }
    return payload as AccessTokenClaims;
  } catch (err) {
    if (err instanceof InvalidAccessTokenError) throw err;
    throw new InvalidAccessTokenError(
      err instanceof Error ? err.message : String(err),
    );
  }
}
