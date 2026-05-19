import { describe, it, expect } from 'vitest';
import { signSessionToken, verifySessionToken } from '@/lib/chatbot/session-token';

const secret = 'test-secret-do-not-use-in-prod';

describe('signSessionToken + verifySessionToken', () => {
  it('round-trips a payload', () => {
    const token = signSessionToken(
      { install_id: 'i', conversation_id: 'c', ip_hash: 'h' },
      secret,
      600,
    );
    const payload = verifySessionToken(token, secret);
    expect(payload).not.toBeNull();
    expect(payload?.install_id).toBe('i');
    expect(payload?.conversation_id).toBe('c');
    expect(payload?.ip_hash).toBe('h');
    expect(payload?.exp).toBeGreaterThan(payload?.iat ?? 0);
  });

  it('rejects a tampered body', () => {
    const token = signSessionToken({ install_id: 'i', conversation_id: 'c', ip_hash: 'h' }, secret, 600);
    const [body, sig] = token.split('.');
    const tamperedBody = Buffer.from(body, 'base64')
      .toString('utf8')
      .replace('"i"', '"hacker"');
    const tampered = Buffer.from(tamperedBody).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    expect(verifySessionToken(`${tampered}.${sig}`, secret)).toBeNull();
  });

  it('rejects a wrong-secret signature', () => {
    const token = signSessionToken({ install_id: 'i', conversation_id: 'c', ip_hash: 'h' }, secret, 600);
    expect(verifySessionToken(token, 'wrong-secret')).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = signSessionToken({ install_id: 'i', conversation_id: 'c', ip_hash: 'h' }, secret, -1);
    expect(verifySessionToken(token, secret)).toBeNull();
  });

  it('rejects a malformed token', () => {
    expect(verifySessionToken('not-a-token', secret)).toBeNull();
    expect(verifySessionToken('', secret)).toBeNull();
    expect(verifySessionToken('a.b.c', secret)).toBeNull();
  });

  it('throws when secret is missing on sign', () => {
    expect(() => signSessionToken({ install_id: 'i', conversation_id: 'c', ip_hash: 'h' }, '', 600)).toThrow();
  });
});
