import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} from 'vitest';
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
  const { _resetKeyCache } = await import('@/lib/oauth/keys');
  _resetKeyCache();
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

describe('GET /.well-known/oauth-authorization-server', () => {
  it('returns RFC-8414-shaped metadata', async () => {
    const { GET } = await import(
      '@/app/api/well-known/oauth-authorization-server/route'
    );
    const res = GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.issuer).toBe('http://test.local');
    expect(body.authorization_endpoint).toBe('http://test.local/oauth/authorize');
    expect(body.token_endpoint).toBe('http://test.local/oauth/token');
    expect(body.registration_endpoint).toBe('http://test.local/oauth/register');
    expect(body.jwks_uri).toBe('http://test.local/.well-known/jwks.json');
    expect(body.code_challenge_methods_supported).toEqual(['S256']);
    expect(body.grant_types_supported).toEqual(['authorization_code']);
  });
});

describe('GET /.well-known/oauth-protected-resource', () => {
  it('returns RFC-9728-shaped metadata pointing to the AS', async () => {
    const { GET } = await import(
      '@/app/api/well-known/oauth-protected-resource/route'
    );
    const res = GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe('http://test.local/api/mcp');
    expect(body.authorization_servers).toEqual([
      'http://test.local/.well-known/oauth-authorization-server',
    ]);
    expect(body.scopes_supported).toEqual(['mas-advisor-mcp']);
  });
});

describe('GET /.well-known/jwks.json', () => {
  it('returns the public key as a JWKS', async () => {
    const { GET } = await import('@/app/api/well-known/jwks.json/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: Array<Record<string, unknown>> };
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0].use).toBe('sig');
    expect(body.keys[0].alg).toBe('RS256');
    expect(body.keys[0].kty).toBe('RSA');
    expect(typeof body.keys[0].n).toBe('string');
  });
});
