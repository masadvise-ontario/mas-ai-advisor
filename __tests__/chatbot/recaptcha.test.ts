import { describe, it, expect, vi } from 'vitest';
import { verifyRecaptcha } from '@/lib/chatbot/recaptcha';

function fakeFetch(body: unknown, ok = true) {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

describe('verifyRecaptcha', () => {
  it('returns no_token when token is empty', async () => {
    const result = await verifyRecaptcha({ token: '', secret: 's' });
    expect(result).toEqual({ ok: false, reason: 'no_token' });
  });

  it('returns no_secret when secret is empty', async () => {
    const result = await verifyRecaptcha({ token: 't', secret: '' });
    expect(result).toEqual({ ok: false, reason: 'no_secret' });
  });

  it('returns ok when score is at or above threshold', async () => {
    const fetchImpl = fakeFetch({ success: true, score: 0.7 });
    const result = await verifyRecaptcha({ token: 't', secret: 's', fetchImpl });
    expect(result).toEqual({ ok: true, score: 0.7 });
  });

  it('returns low_score when below threshold', async () => {
    const fetchImpl = fakeFetch({ success: true, score: 0.3 });
    const result = await verifyRecaptcha({ token: 't', secret: 's', fetchImpl });
    expect(result).toEqual({ ok: false, score: 0.3, reason: 'low_score' });
  });

  it('returns verify_failed when google returns success: false', async () => {
    const fetchImpl = fakeFetch({ success: false, 'error-codes': ['bad-token'] });
    const result = await verifyRecaptcha({ token: 't', secret: 's', fetchImpl });
    expect(result).toEqual({ ok: false, reason: 'verify_failed' });
  });

  it('returns verify_failed when HTTP is non-OK', async () => {
    const fetchImpl = fakeFetch({}, false);
    const result = await verifyRecaptcha({ token: 't', secret: 's', fetchImpl });
    expect(result).toEqual({ ok: false, reason: 'verify_failed' });
  });

  it('respects a custom threshold', async () => {
    const fetchImpl = fakeFetch({ success: true, score: 0.4 });
    const result = await verifyRecaptcha({ token: 't', secret: 's', threshold: 0.3, fetchImpl });
    expect(result).toEqual({ ok: true, score: 0.4 });
  });
});
