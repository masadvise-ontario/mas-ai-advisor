import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';

const ORIGINAL = {
  priv: process.env.MAS_ADVISOR_OAUTH_JWT_PRIVATE_KEY,
  pub: process.env.MAS_ADVISOR_OAUTH_JWT_PUBLIC_KEY,
  iss: process.env.MAS_ADVISOR_OAUTH_ISSUER,
};

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', {
    extractable: true,
  });
  process.env.MAS_ADVISOR_OAUTH_JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.MAS_ADVISOR_OAUTH_JWT_PUBLIC_KEY = await exportSPKI(publicKey);
  process.env.MAS_ADVISOR_OAUTH_ISSUER = 'http://test.local';
});

afterAll(() => {
  for (const [k, v] of Object.entries({
    MAS_ADVISOR_OAUTH_JWT_PRIVATE_KEY: ORIGINAL.priv,
    MAS_ADVISOR_OAUTH_JWT_PUBLIC_KEY: ORIGINAL.pub,
    MAS_ADVISOR_OAUTH_ISSUER: ORIGINAL.iss,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('OAuth access-token JWTs', () => {
  it('round-trips sign → verify with expected claims', async () => {
    const { _resetKeyCache } = await import('@/lib/oauth/keys');
    _resetKeyCache();
    const { signAccessToken, verifyAccessToken } = await import(
      '@/lib/oauth/jwt'
    );

    const token = await signAccessToken({
      sub: 'google|123',
      email: 'user@example.com',
      email_verified: true,
      client_id: 'mac_test',
      scope: 'mas-advisor-mcp',
    });

    const claims = await verifyAccessToken(token);
    expect(claims.sub).toBe('google|123');
    expect(claims.email).toBe('user@example.com');
    expect(claims.email_verified).toBe(true);
    expect(claims.client_id).toBe('mac_test');
    expect(claims.scope).toBe('mas-advisor-mcp');
    expect(claims.iss).toBe('http://test.local');
    expect(claims.aud).toBe('http://test.local/api/mcp');
  });

  it('rejects a token signed by a different key', async () => {
    const { _resetKeyCache } = await import('@/lib/oauth/keys');
    _resetKeyCache();
    const { signAccessToken } = await import('@/lib/oauth/jwt');

    // Sign with the configured (test) key.
    const token = await signAccessToken({
      sub: 'google|123',
      email: 'user@example.com',
      email_verified: true,
      client_id: 'mac_test',
      scope: 'mas-advisor-mcp',
    });

    // Swap in a new keypair and reset the cache so verification uses
    // a different public key.
    const newPair = await generateKeyPair('RS256', { extractable: true });
    process.env.MAS_ADVISOR_OAUTH_JWT_PUBLIC_KEY = await exportSPKI(
      newPair.publicKey,
    );
    _resetKeyCache();
    const { verifyAccessToken, InvalidAccessTokenError } = await import(
      '@/lib/oauth/jwt'
    );

    await expect(verifyAccessToken(token)).rejects.toBeInstanceOf(
      InvalidAccessTokenError,
    );
  });

  it('rejects a token with the wrong audience', async () => {
    const { _resetKeyCache } = await import('@/lib/oauth/keys');
    _resetKeyCache();
    const { signAccessToken, verifyAccessToken, InvalidAccessTokenError } =
      await import('@/lib/oauth/jwt');

    const token = await signAccessToken({
      sub: 'google|123',
      email: 'user@example.com',
      email_verified: true,
      client_id: 'mac_test',
      scope: 'mas-advisor-mcp',
      audience: 'http://other.local/api/mcp',
    });

    await expect(verifyAccessToken(token)).rejects.toBeInstanceOf(
      InvalidAccessTokenError,
    );
  });
});
