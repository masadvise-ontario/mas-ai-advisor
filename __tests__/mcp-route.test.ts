import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { POST } from '@/app/api/mcp/route';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const TEST_KEY = 'test-bearer-key';

const ORIGINAL_KEY = process.env.MAS_ADVISOR_API_KEY;

beforeEach(() => {
  process.env.MAS_ADVISOR_API_KEY = TEST_KEY;
  mockClient.query.mockReset();
  mockClient.release.mockReset();
  mockPool.connect.mockClear();
  mockPool.query.mockReset();
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.MAS_ADVISOR_API_KEY;
  else process.env.MAS_ADVISOR_API_KEY = ORIGINAL_KEY;
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
    // The SDK writes SSE frames as `event: message\ndata: <json>\n\n`. Pick
    // the first data line and parse it.
    const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
    if (!dataLine) throw new Error(`no data line in SSE response: ${text}`);
    return JSON.parse(dataLine.slice('data: '.length));
  }
  return JSON.parse(text);
}

describe('POST /api/mcp', () => {
  it('returns 401 with WWW-Authenticate when Authorization header is missing', async () => {
    const req = mcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '0' },
      },
    });
    // @ts-expect-error — Next's POST handler takes NextRequest; a Web Request works at runtime.
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toMatch(/^Bearer/);
  });

  it('returns 401 when the Bearer token does not match MAS_ADVISOR_API_KEY', async () => {
    const req = mcpRequest(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '0' },
        },
      },
      { auth: 'Bearer wrong-token' },
    );
    // @ts-expect-error — see above.
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('lists the three Advisor tools on tools/list', async () => {
    const req = mcpRequest(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      },
      { auth: `Bearer ${TEST_KEY}` },
    );
    // @ts-expect-error — see above.
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await readJsonOrSse(res)) as {
      result: { tools: Array<{ name: string }> };
    };
    const names = body.result.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'record_turn',
      'register_install',
      'set_conversation_privacy',
    ]);
  });

  it('invokes register_install through tools/call and persists to the DB', async () => {
    mockClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

    const req = mcpRequest(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'register_install',
          arguments: {
            install_id: VALID_UUID,
            platform: 'claude',
            share_history: true,
            email: 'user@example.com',
          },
        },
      },
      { auth: `Bearer ${TEST_KEY}` },
    );
    // @ts-expect-error — see above.
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await readJsonOrSse(res)) as {
      result: {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };
    };
    expect(body.result.isError).toBeFalsy();
    expect(body.result.content[0].text).toMatch(/"ok":true/);

    const calls = mockClient.query.mock.calls.map(([sql]) => sql);
    expect(calls[0]).toBe('BEGIN');
    expect(calls).toContain('COMMIT');
  });

  it('returns an MCP error result (isError) when register_install fails', async () => {
    mockClient.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return { rowCount: 0, rows: [] };
      if (sql.includes('INSERT INTO mas_journey_installs')) {
        throw new Error('db down');
      }
      return { rowCount: 0, rows: [] };
    });

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
            share_history: false,
          },
        },
      },
      { auth: `Bearer ${TEST_KEY}` },
    );
    // @ts-expect-error — see above.
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await readJsonOrSse(res)) as {
      result: { isError?: boolean; content: Array<{ text: string }> };
    };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/server error/);
  });

  it('returns an MCP error result for record_turn against an unknown install_id', async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const req = mcpRequest(
      {
        jsonrpc: '2.0',
        id: 4,
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
      { auth: `Bearer ${TEST_KEY}` },
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
