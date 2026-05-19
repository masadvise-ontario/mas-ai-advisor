import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SessionPayload {
  install_id: string;
  conversation_id: string;
  ip_hash: string;
  exp: number;
  iat: number;
}

function base64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function signSessionToken(
  payload: Omit<SessionPayload, 'exp' | 'iat'>,
  secret: string,
  ttlSeconds: number,
): string {
  if (!secret) throw new Error('secret required');
  const iat = Math.floor(Date.now() / 1000);
  const full: SessionPayload = { ...payload, iat, exp: iat + ttlSeconds };
  const body = base64url(JSON.stringify(full));
  const sig = base64url(createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
): SessionPayload | null {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = base64url(createHmac('sha256', secret).update(body).digest());
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(fromBase64url(body).toString('utf8')) as SessionPayload;
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;
  return payload;
}
