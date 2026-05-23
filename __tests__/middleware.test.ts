import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

function makeRequest(opts: { method: string; origin?: string | null }) {
  const headers = new Headers();
  if (opts.origin !== null && opts.origin !== undefined) {
    headers.set('origin', opts.origin);
  }
  return new NextRequest('https://advisor.masadvise.org/api/chat/session/start', {
    method: opts.method,
    headers,
  });
}

describe('CORS middleware for /api/chat/*', () => {
  it('responds 204 with CORS headers to OPTIONS preflight from allowed origin', () => {
    const req = makeRequest({ method: 'OPTIONS', origin: 'https://www.masadvise.org' });
    const res = middleware(req);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://www.masadvise.org');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-methods')).toContain('OPTIONS');
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('content-type');
    expect(res.headers.get('vary')).toBe('Origin');
  });

  it('returns empty Allow-Origin for OPTIONS from disallowed origin', () => {
    const req = makeRequest({ method: 'OPTIONS', origin: 'https://evil.example.com' });
    const res = middleware(req);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('');
  });

  it('returns empty Allow-Origin for OPTIONS with no Origin header', () => {
    const req = makeRequest({ method: 'OPTIONS', origin: null });
    const res = middleware(req);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('');
  });

  it('passes through non-OPTIONS requests and adds CORS headers for allowed origin', () => {
    const req = makeRequest({ method: 'POST', origin: 'https://masadvise.org' });
    const res = middleware(req);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://masadvise.org');
    expect(res.headers.get('vary')).toBe('Origin');
  });

  it('allows the npaiadvisor mirror domain', () => {
    const req = makeRequest({ method: 'OPTIONS', origin: 'https://www.npaiadvisor.com' });
    const res = middleware(req);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://www.npaiadvisor.com');
  });

  it('allows localhost for dev', () => {
    const req = makeRequest({ method: 'OPTIONS', origin: 'http://localhost:3000' });
    const res = middleware(req);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });
});
