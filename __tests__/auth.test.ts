import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';

const ORIGINAL = {
  apiKey: process.env.MAS_ADVISOR_API_KEY,
  priv: process.env.MAS_ADVISOR_OAUTH_JWT_PRIVATE_KEY,
  pub: process.env.MAS_ADVISOR_OAUTH_JWT_PUBLIC_KEY,
  iss: process.env.MAS_ADVISOR_OAUTH_ISSUER,
};

let signedToken = '';

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', {
    extractable: true,
  });
  process.env.MAS_ADVISOR_OAUTH_JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.MAS_ADVISOR_OAUTH_JWT_PUBLIC_KEY = await exportSPKI(publicKey);
  process.env.MAS_ADVISOR_OAUTH_ISSUER = 'http://test.local';

  const { _resetKeyCache } = await import('@/lib/oauth/keys');
  _resetKeyCache();
  const { signAccessToken } = await import('@/lib/oauth/jwt');
  signedToken = await signAccessToken({
    sub: 'google|test-user',
    email: 'user@example.com',
    email_verified: true,
    client_id: 'mac_test_client',
    scope: 'mas-advisor-mcp',
  });
});

afterAll(() => {
  for (const [k, v] of Object.entries({
    MAS_ADVISOR_API_KEY: ORIGINAL.apiKey,
    MAS_ADVISOR_OAUTH_JWT_PRIVATE_KEY: ORIGINAL.priv,
    MAS_ADVISOR_OAUTH_JWT_PUBLIC_KEY: ORIGINAL.pub,
    MAS_ADVISOR_OAUTH_ISSUER: ORIGINAL.iss,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function fakeReq(headers: Record<string, string>): Request {
  return new Request('http://test.local/api/mcp', { headers });
}

describe('checkApiKey (X-API-Key, REST routes)', () => {
  beforeEach(() => {
    process.env.MAS_ADVISOR_API_KEY = 'test-key-abcdef';
  });
  afterEach(() => {
    delete process.env.MAS_ADVISOR_API_KEY;
  });

  it('accepts a matching x-api-key header', async () => {
    const { checkApiKey } = await import('@/lib/auth');
    const req = fakeReq({
      'x-api-key': 'test-key-abcdef',
    }) as unknown as Parameters<typeof checkApiKey>[0];
    expect(checkApiKey(req)).toEqual({ ok: true });
  });

  it('rejects mismatched x-api-key', async () => {
    const { checkApiKey } = await import('@/lib/auth');
    const req = fakeReq({ 'x-api-key': 'wrong' }) as unknown as Parameters<
      typeof checkApiKey
    >[0];
    expect(checkApiKey(req)).toEqual({ ok: false, reason: 'unauthorized' });
  });
});

describe('verifyMcpAuth (OAuth bearer, /api/mcp)', () => {
  it('accepts a JWT signed by our OAuth provider', async () => {
    const { verifyMcpAuth } = await import('@/lib/auth');
    const req = fakeReq({ authorization: `Bearer ${signedToken}` });
    const result = await verifyMcpAuth(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authInfo.clientId).toBe('mac_test_client');
      expect(result.authInfo.scopes).toEqual(['mas-advisor-mcp']);
      expect(result.authInfo.extra).toMatchObject({
        email: 'user@example.com',
        email_verified: true,
        sub: 'google|test-user',
      });
    }
  });

  it('rejects a missing Authorization header', async () => {
    const { verifyMcpAuth } = await import('@/lib/auth');
    const result = await verifyMcpAuth(fakeReq({}));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/missing bearer/);
  });

  it('rejects a bogus token', async () => {
    const { verifyMcpAuth } = await import('@/lib/auth');
    const result = await verifyMcpAuth(
      fakeReq({ authorization: 'Bearer not.a.real.token' }),
    );
    expect(result.ok).toBe(false);
  });
});
