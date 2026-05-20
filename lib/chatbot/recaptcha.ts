const SITEVERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const DEFAULT_THRESHOLD = 0.5;

export interface RecaptchaVerifyResult {
  ok: boolean;
  score?: number;
  reason?: 'no_token' | 'no_secret' | 'verify_failed' | 'low_score';
}

interface SiteverifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

export async function verifyRecaptcha(opts: {
  token: string | null | undefined;
  secret: string | null | undefined;
  threshold?: number;
  remoteIp?: string;
  fetchImpl?: typeof fetch;
}): Promise<RecaptchaVerifyResult> {
  const { token, secret, threshold = DEFAULT_THRESHOLD, remoteIp, fetchImpl = fetch } = opts;
  if (!token) return { ok: false, reason: 'no_token' };
  if (!secret) return { ok: false, reason: 'no_secret' };

  const params = new URLSearchParams();
  params.set('secret', secret);
  params.set('response', token);
  if (remoteIp) params.set('remoteip', remoteIp);

  const res = await fetchImpl(SITEVERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) return { ok: false, reason: 'verify_failed' };
  const json = (await res.json()) as SiteverifyResponse;
  if (!json.success) return { ok: false, reason: 'verify_failed' };
  const score = json.score ?? 0;
  if (score < threshold) return { ok: false, score, reason: 'low_score' };
  return { ok: true, score };
}
