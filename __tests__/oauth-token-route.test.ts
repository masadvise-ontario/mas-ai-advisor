import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';

const mockPool = { query: vi.fn(), connect: vi.fn() };
vi.mock('@/lib/db', () => ({
  getPool: () => mockPool,
  SCOPE: 'mas-public-advisor',
}));

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

beforeEach(() => {
  mockPool.query.mockReset();
});

function makePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256')
    .update(verifier, 'utf8')
    .digest('base64url');
  return { verifier, challenge };
}

function formRequest(body: Record<string, string>): Request {
  return new Request('http://test.local/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
}

const CLIENT_ID = 'mac_test_client';
const REDIRECT_URI = 'https://claude.ai/cb';

function mockClientLookup() {
  // findClient
  mockPool.query.mockResolvedValueOnce({
    rowCount: 1,
    rows: [
      {
        client_id: CLIENT_ID,
        client_name: 'claude.ai',
        redirect_uris: [REDIRECT_URI],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: 'mas-advisor-mcp',
        created_at: new Date(),
        revoked_at: null,
      },
    ],
  });
}

describe('POST /oauth/token', () => {
  it('exchanges a valid code+verifier for an access token', async () => {
    const { verifier, challenge } = makePkce();
    mockClientLookup();
    // consumeAuthorizationCode
    mockPool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          code: 'mac_code_abc',
          client_id: CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          user_sub: 'google|user',
          user_email: 'user@example.com',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          resource: null,
          scope: 'mas-advisor-mcp',
          expires_at: new Date(Date.now() + 60_000),
        },
      ],
    });

    const { POST } = await import('@/app/oauth/token/route');
    const res = await POST(
      formRequest({
        grant_type: 'authorization_code',
        code: 'mac_code_abc',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.token_type).toBe('Bearer');
    expect(typeof body.access_token).toBe('string');
    expect(body.scope).toBe('mas-advisor-mcp');
  });

  it('rejects PKCE verifier mismatch with invalid_grant', async () => {
    const { challenge } = makePkce();
    mockClientLookup();
    mockPool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          code: 'mac_code_abc',
          client_id: CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          user_sub: 'google|user',
          user_email: 'user@example.com',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          resource: null,
          scope: 'mas-advisor-mcp',
          expires_at: new Date(Date.now() + 60_000),
        },
      ],
    });

    const { POST } = await import('@/app/oauth/token/route');
    const res = await POST(
      formRequest({
        grant_type: 'authorization_code',
        code: 'mac_code_abc',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: randomBytes(32).toString('base64url'),
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('invalid_grant');
  });

  it('rejects an unknown grant_type', async () => {
    const { POST } = await import('@/app/oauth/token/route');
    const res = await POST(
      formRequest({
        grant_type: 'password',
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('unsupported_grant_type');
  });

  it('rejects when the code is not found (already used or expired)', async () => {
    const { verifier } = makePkce();
    mockClientLookup();
    // consumeAuthorizationCode returns no rows
    mockPool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const { POST } = await import('@/app/oauth/token/route');
    const res = await POST(
      formRequest({
        grant_type: 'authorization_code',
        code: 'mac_code_unknown',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('invalid_grant');
  });
});
