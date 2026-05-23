import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { registerInstall } from '@/lib/handlers';
import { chatSessionStartSchema } from '@/lib/schemas';
import { hashIp } from '@/lib/chatbot/ip-hash';
import { verifyRecaptcha } from '@/lib/chatbot/recaptcha';
import { checkAndIncrementConversation } from '@/lib/chatbot/rate-limit';
import { isKilled } from '@/lib/chatbot/kill-switch';
import { installIdFromEmail, anonymousInstallId } from '@/lib/chatbot/install-id';
import { signSessionToken } from '@/lib/chatbot/session-token';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';

const SESSION_TOKEN_TTL_SECONDS = 10 * 60; // one-time token, exchanged for cookie immediately

function getClientIp(req: NextRequest): string {
  // Vercel sets x-forwarded-for; first IP in the list is the originator.
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(req: NextRequest) {
  const parsed = chatSessionStartSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;
  if (!body.tc_accepted) {
    return NextResponse.json({ error: 'tc_not_accepted' }, { status: 400 });
  }

  const ip = getClientIp(req);
  const salt = process.env.IP_HASH_SALT;
  const sessionSecret = process.env.SESSION_TOKEN_SECRET;
  if (!salt || !sessionSecret) {
    console.error('[session/start] missing IP_HASH_SALT or SESSION_TOKEN_SECRET');
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  const captcha = await verifyRecaptcha({
    token: body.recaptcha_token,
    secret: process.env.RECAPTCHA_SECRET_KEY,
    remoteIp: ip,
  });
  if (!captcha.ok) {
    return NextResponse.json(
      { error: 'recaptcha_failed', reason: captcha.reason },
      { status: 403 },
    );
  }

  const pool = getPool();

  if (await isKilled(pool)) {
    return NextResponse.json(
      { error: 'service_paused', message: 'The MAS advisor is briefly paused. Please try again later.' },
      { status: 503 },
    );
  }

  const ipHash = hashIp(ip, salt);

  // Dev bypass: emails listed in CHATBOT_BYPASS_EMAILS (comma-separated,
  // case-insensitive) skip the per-IP-per-day cap. Lets Brian smoke-test
  // freely without burning the 5/day production budget. Bypass emails
  // are case-folded + trimmed for matching.
  const bypassEmails = (process.env.CHATBOT_BYPASS_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const bypassActive =
    body.email != null && bypassEmails.includes(body.email.toLowerCase());

  if (bypassActive) {
    console.info(`[session/start] rate-limit bypass active for ${body.email}`);
  } else {
    const rateCheck = await checkAndIncrementConversation(pool, ipHash);
    if (!rateCheck.ok) {
      return NextResponse.json(
        { error: 'rate_limited', reason: rateCheck.reason },
        { status: 429 },
      );
    }
  }

  const installId = body.email ? installIdFromEmail(body.email) : anonymousInstallId();
  const conversationId = randomUUID();
  const tcVersion = process.env.CHATBOT_TC_VERSION ?? null;

  try {
    await registerInstall({
      install_id: installId,
      platform: 'web',
      email: body.email ?? null,
      share_history: body.share_history,
      source: 'masadvise-ai-page',
      tc_version: tcVersion,
    });

    await pool.query(
      `INSERT INTO chatbot_conversations (conversation_id, install_id, ip_hash)
       VALUES ($1, $2, $3)`,
      [conversationId, installId, ipHash],
    );
  } catch (err) {
    console.error('[session/start] registration error', err);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }

  const sessionToken = signSessionToken(
    { install_id: installId, conversation_id: conversationId, ip_hash: ipHash },
    sessionSecret,
    SESSION_TOKEN_TTL_SECONDS,
  );

  return NextResponse.json({ ok: true, session_token: sessionToken });
}
