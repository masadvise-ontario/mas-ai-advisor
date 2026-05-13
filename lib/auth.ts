import type { NextRequest } from 'next/server';

export function checkApiKey(req: NextRequest): {
  ok: boolean;
  reason?: string;
} {
  const expected = process.env.MAS_ADVISOR_API_KEY;
  if (!expected) {
    return { ok: false, reason: 'server misconfigured: missing api key' };
  }
  const provided = req.headers.get('x-api-key');
  if (!provided || provided !== expected) {
    return { ok: false, reason: 'unauthorized' };
  }
  return { ok: true };
}
