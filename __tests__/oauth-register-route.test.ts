import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';

const mockPool = { query: vi.fn(), connect: vi.fn() };
vi.mock('@/lib/db', () => ({
  getPool: () => mockPool,
  SCOPE: 'mas-public-advisor',
}));

const ORIGINAL_ISS = process.env.MAS_ADVISOR_OAUTH_ISSUER;

beforeAll(() => {
  process.env.MAS_ADVISOR_OAUTH_ISSUER = 'http://test.local';
});

afterAll(() => {
  if (ORIGINAL_ISS === undefined) delete process.env.MAS_ADVISOR_OAUTH_ISSUER;
  else process.env.MAS_ADVISOR_OAUTH_ISSUER = ORIGINAL_ISS;
});

beforeEach(() => {
  mockPool.query.mockReset();
});

function jsonRequest(body: unknown): Request {
  return new Request('http://test.local/oauth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /oauth/register (DCR)', () => {
  it('registers a public client and returns 201 with client_id', async () => {
    mockPool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          client_id: 'mac_abc',
          client_name: 'claude.ai (test)',
          redirect_uris: ['https://claude.ai/cb'],
          grant_types: ['authorization_code'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          scope: 'mas-advisor-mcp',
          created_at: new Date('2026-05-17T00:00:00Z'),
          revoked_at: null,
        },
      ],
    });

    const { POST } = await import('@/app/oauth/register/route');
    const res = await POST(
      jsonRequest({
        client_name: 'claude.ai (test)',
        redirect_uris: ['https://claude.ai/cb'],
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.client_id).toBe('mac_abc');
    expect(body.token_endpoint_auth_method).toBe('none');
    expect(body.grant_types).toEqual(['authorization_code']);
  });

  it('rejects malformed body with 400', async () => {
    const { POST } = await import('@/app/oauth/register/route');
    const res = await POST(
      jsonRequest({ redirect_uris: [] }) as unknown as Parameters<
        typeof POST
      >[0],
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('invalid_client_metadata');
  });

  it('filters unsupported grant_types and registers with the supported subset', async () => {
    mockPool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          client_id: 'mac_xyz',
          client_name: 'claude.ai',
          redirect_uris: ['https://claude.ai/cb'],
          grant_types: ['authorization_code'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          scope: 'mas-advisor-mcp',
          created_at: new Date(),
          revoked_at: null,
        },
      ],
    });

    const { POST } = await import('@/app/oauth/register/route');
    const res = await POST(
      jsonRequest({
        client_name: 'claude.ai',
        redirect_uris: ['https://claude.ai/cb'],
        // claude.ai requests refresh_token alongside authorization_code.
        // We filter to just authorization_code rather than rejecting.
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.grant_types).toEqual(['authorization_code']);
  });
});
