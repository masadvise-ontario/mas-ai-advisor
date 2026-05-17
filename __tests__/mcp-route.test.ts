import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';

const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};
const mockPool = {
  connect: vi.fn(async () => mockClient),
  query: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  getPool: () => mockPool,
  SCOPE: 'mas-public-advisor',
}));

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

const ORIGINAL = {
  priv: process.env.MAS_ADVISOR_OAUTH_JWT_PRIVATE_KEY,
  pub: process.env.MAS_ADVISOR_OAUTH_JWT_PUBLIC_KEY,
  iss: process.env.MAS_ADVISOR_OAUTH_ISSUER,
};

let validToken = '';

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', {
    extractable: true,
  });
  process.env.MAS_ADVISOR_OAUTH_JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.MAS_ADVISOR_OAUTH_JWT_PUBLIC_KEY = await exportSPKI(publicKey);
  process.env.MAS_ADVISOR_OAUTH_ISSUER = 'http://test.local';

  // Sign a real OAuth access token for the happy-path tests.
  const { _resetKeyCache } = await import('@/lib/oauth/keys');
  _resetKeyCache();
  const { signAccessToken } = await import('@/lib/oauth/jwt');
  validToken = await signAccessToken({
    sub: 'google|test-user',
    email: 'tester@example.com',
    email_verified: true,
    client_id: 'mac_test_client',
    scope: 'mas-advisor-mcp',
  });
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
  mockClient.query.mockReset();
  mockClient.release.mockReset();
  mockPool.connect.mockClear();
  mockPool.query.mockReset();
});

function mcpRequest(body: unknown, opts: { auth?: string } = {}): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (opts.auth !== undefined) headers.authorization = opts.auth;
  return new Request('http://test.local/api/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function readJsonOrSse(res: Response): Promise<unknown> {
  const ct = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (ct.includes('text/event-stream')) {
    const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
    if (!dataLine) throw new Error(`no data line in SSE response: ${text}`);
    return JSON.parse(dataLine.slice('data: '.length));
  }
  return JSON.parse(text);
}

describe('POST /api/mcp (OAuth 2.1)', () => {
  it('returns 401 with RFC-9728 WWW-Authenticate when Authorization is missing', async () => {
    const { POST } = await import('@/app/api/mcp/route');
    const req = mcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    // @ts-expect-error — Web Request satisfies POST's NextRequest shape at runtime.
    const res = await POST(req);
    expect(res.status).toBe(401);
    const challenge = res.headers.get('WWW-Authenticate') ?? '';
    expect(challenge).toMatch(/^Bearer/);
    expect(challenge).toMatch(/resource_metadata=/);
    expect(challenge).toMatch(/oauth-protected-resource/);
  });

  it('returns 401 when the Bearer token signature is invalid', async () => {
    const { POST } = await import('@/app/api/mcp/route');
    const req = mcpRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      { auth: 'Bearer not.a.real.token' },
    );
    // @ts-expect-error — see above.
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('lists four Advisor tools on tools/list with a valid token', async () => {
    const { POST } = await import('@/app/api/mcp/route');
    const req = mcpRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      { auth: `Bearer ${validToken}` },
    );
    // @ts-expect-error — see above.
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await readJsonOrSse(res)) as {
      result: { tools: Array<{ name: string }> };
    };
    const names = body.result.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'get_user_identity',
      'record_turn',
      'register_install',
      'set_conversation_privacy',
    ]);
  });

  it('get_user_identity returns the verified OAuth email + flag', async () => {
    const { POST } = await import('@/app/api/mcp/route');
    const req = mcpRequest(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_user_identity', arguments: {} },
      },
      { auth: `Bearer ${validToken}` },
    );
    // @ts-expect-error — see above.
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await readJsonOrSse(res)) as {
      result: { content: Array<{ text: string }>; isError?: boolean };
    };
    expect(body.result.isError).toBeFalsy();
    const payload = JSON.parse(body.result.content[0].text);
    expect(payload).toEqual({
      email: 'tester@example.com',
      email_verified: true,
    });
  });

  it('register_install with no email falls back to the OAuth email', async () => {
    mockClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

    const { POST } = await import('@/app/api/mcp/route');
    const req = mcpRequest(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'register_install',
          arguments: {
            install_id: VALID_UUID,
            platform: 'claude',
            share_history: true,
            // email omitted on purpose — the route should fall back to the OAuth email.
          },
        },
      },
      { auth: `Bearer ${validToken}` },
    );
    // @ts-expect-error — see above.
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await readJsonOrSse(res)) as {
      result: { content: Array<{ text: string }>; isError?: boolean };
    };
    expect(body.result.isError, body.result.content[0]?.text).toBeFalsy();

    // The INSERT call should have used the OAuth email value.
    const insertCall = mockClient.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO mas_journey_installs'),
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    // params order in lib/handlers/register-install.ts:
    //   [install_id, scope, platform, email, share_history, source]
    expect(params[3]).toBe('tester@example.com');
  });

  it('register_install with email_decline:true stores NULL email even though OAuth has one', async () => {
    mockClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

    const { POST } = await import('@/app/api/mcp/route');
    const req = mcpRequest(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'register_install',
          arguments: {
            install_id: VALID_UUID,
            platform: 'claude',
            share_history: false,
            email_decline: true,
          },
        },
      },
      { auth: `Bearer ${validToken}` },
    );
    // @ts-expect-error — see above.
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await readJsonOrSse(res)) as {
      result: { content: Array<{ text: string }>; isError?: boolean };
    };
    expect(body.result.isError, body.result.content[0]?.text).toBeFalsy();

    const insertCall = mockClient.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO mas_journey_installs'),
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[3]).toBeNull();
  });

  it('register_install with explicit override email stores the override', async () => {
    mockClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

    const { POST } = await import('@/app/api/mcp/route');
    const req = mcpRequest(
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'register_install',
          arguments: {
            install_id: VALID_UUID,
            platform: 'claude',
            share_history: true,
            email: 'work@example.org',
          },
        },
      },
      { auth: `Bearer ${validToken}` },
    );
    // @ts-expect-error — see above.
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await readJsonOrSse(res)) as {
      result: { content: Array<{ text: string }>; isError?: boolean };
    };
    expect(body.result.isError, body.result.content[0]?.text).toBeFalsy();

    const insertCall = mockClient.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO mas_journey_installs'),
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[3]).toBe('work@example.org');
  });

  it('returns an MCP error result for record_turn against an unknown install_id', async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const { POST } = await import('@/app/api/mcp/route');
    const req = mcpRequest(
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'record_turn',
          arguments: {
            install_id: VALID_UUID,
            conversation_id: VALID_UUID,
            event_subtype: 'turn_started',
          },
        },
      },
      { auth: `Bearer ${validToken}` },
    );
    // @ts-expect-error — see above.
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await readJsonOrSse(res)) as {
      result: { isError?: boolean; content: Array<{ text: string }> };
    };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/unknown install_id/);
  });
});
