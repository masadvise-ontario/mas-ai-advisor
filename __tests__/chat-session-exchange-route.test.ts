import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/chat/session/exchange/route';
import { signSessionToken } from '@/lib/chatbot/session-token';
import { SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE_SECONDS } from '@/lib/chatbot/cookies';

const SECRET = 'test-secret-do-not-use-in-prod';
const PAYLOAD = {
  install_id: '550e8400-e29b-41d4-a716-446655440000',
  conversation_id: '550e8400-e29b-41d4-a716-446655440001',
  ip_hash: 'abc123',
};

function makeReq(token?: string) {
  const url = token
    ? `https://advisor.masadvise.org/api/chat/session/exchange?t=${encodeURIComponent(token)}`
    : `https://advisor.masadvise.org/api/chat/session/exchange`;
  return new NextRequest(url, { headers: { 'x-forwarded-proto': 'https' } });
}

describe('GET /api/chat/session/exchange', () => {
  const originalSecret = process.env.SESSION_TOKEN_SECRET;

  beforeEach(() => {
    process.env.SESSION_TOKEN_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.SESSION_TOKEN_SECRET;
    else process.env.SESSION_TOKEN_SECRET = originalSecret;
  });

  it('writes a session cookie and redirects to /chat for a valid token', async () => {
    const token = signSessionToken(PAYLOAD, SECRET, 60);
    const res = await GET(makeReq(token));

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('location')).toMatch(/\/chat$/);

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=None');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain(`Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`);
    expect(setCookie).toContain('Path=/');
  });

  it('redirects to /chat without setting a cookie when no token is provided', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('location')).toMatch(/\/chat$/);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('redirects to /chat without setting a cookie for an invalid token', async () => {
    const res = await GET(makeReq('not-a-real-token'));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('redirects to /chat without setting a cookie for an expired token', async () => {
    const token = signSessionToken(PAYLOAD, SECRET, -60); // already expired
    const res = await GET(makeReq(token));
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('redirects without crashing when SESSION_TOKEN_SECRET is missing', async () => {
    delete process.env.SESSION_TOKEN_SECRET;
    const res = await GET(makeReq('any-token'));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
