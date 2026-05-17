import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkApiKey, checkBearerToken } from '@/lib/auth';

const ORIGINAL_KEY = process.env.MAS_ADVISOR_API_KEY;

function fakeReq(headers: Record<string, string>): Request {
  return new Request('http://test.local/api/mcp', { headers });
}

beforeEach(() => {
  process.env.MAS_ADVISOR_API_KEY = 'test-key-abcdef';
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.MAS_ADVISOR_API_KEY;
  else process.env.MAS_ADVISOR_API_KEY = ORIGINAL_KEY;
});

describe('checkApiKey (X-API-Key, existing REST routes)', () => {
  it('accepts a matching x-api-key header', () => {
    // checkApiKey takes NextRequest, but a Web Request satisfies the .headers.get shape it uses.
    const req = fakeReq({ 'x-api-key': 'test-key-abcdef' }) as unknown as Parameters<
      typeof checkApiKey
    >[0];
    expect(checkApiKey(req)).toEqual({ ok: true });
  });

  it('rejects mismatched x-api-key', () => {
    const req = fakeReq({ 'x-api-key': 'wrong' }) as unknown as Parameters<
      typeof checkApiKey
    >[0];
    expect(checkApiKey(req)).toEqual({ ok: false, reason: 'unauthorized' });
  });
});

describe('checkBearerToken (Authorization: Bearer, new MCP route)', () => {
  it('accepts a matching Bearer token', () => {
    const req = fakeReq({ authorization: 'Bearer test-key-abcdef' });
    expect(checkBearerToken(req)).toEqual({ ok: true });
  });

  it('is case-insensitive on the scheme', () => {
    const req = fakeReq({ authorization: 'bearer test-key-abcdef' });
    expect(checkBearerToken(req)).toEqual({ ok: true });
  });

  it('rejects missing Authorization header', () => {
    const req = fakeReq({});
    const result = checkBearerToken(req);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: 'missing bearer token' });
  });

  it('rejects a Bearer header with the wrong token', () => {
    const req = fakeReq({ authorization: 'Bearer wrong-token' });
    expect(checkBearerToken(req)).toEqual({
      ok: false,
      reason: 'invalid bearer token',
    });
  });

  it('rejects a non-Bearer scheme', () => {
    const req = fakeReq({ authorization: 'Basic dXNlcjpwYXNz' });
    expect(checkBearerToken(req)).toEqual({
      ok: false,
      reason: 'missing bearer token',
    });
  });

  it('reports misconfiguration when MAS_ADVISOR_API_KEY is unset', () => {
    delete process.env.MAS_ADVISOR_API_KEY;
    const req = fakeReq({ authorization: 'Bearer anything' });
    expect(checkBearerToken(req)).toEqual({
      ok: false,
      reason: 'server misconfigured: missing api key',
    });
  });
});
