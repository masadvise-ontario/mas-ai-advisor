import { NextRequest, NextResponse } from 'next/server';
import { signSessionToken, verifySessionToken } from '@/lib/chatbot/session-token';
import {
  SESSION_COOKIE_MAX_AGE_SECONDS,
  buildSessionCookie,
} from '@/lib/chatbot/cookies';

export const runtime = 'nodejs';

// Iframe lands here with ?t=<one-time-token> from /api/chat/session/start.
// Server Components in Next.js 15+ cannot set cookies, so the token-for-cookie
// exchange must happen in a Route Handler. We verify, re-sign with the longer
// session-cookie TTL, write the cookie, and 302 to /chat.
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t');
  const sessionSecret = process.env.SESSION_TOKEN_SECRET;

  if (!sessionSecret) {
    console.error('[session/exchange] missing SESSION_TOKEN_SECRET');
    return NextResponse.redirect(new URL('/chat', req.url));
  }

  // No token or bad token — let /chat render its standard error shell.
  if (!t) {
    return NextResponse.redirect(new URL('/chat', req.url));
  }

  const payload = verifySessionToken(t, sessionSecret);
  if (!payload) {
    return NextResponse.redirect(new URL('/chat', req.url));
  }

  const cookieToken = signSessionToken(
    {
      install_id: payload.install_id,
      conversation_id: payload.conversation_id,
      ip_hash: payload.ip_hash,
    },
    sessionSecret,
    SESSION_COOKIE_MAX_AGE_SECONDS,
  );

  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '');
  const secure = proto === 'https';

  const res = NextResponse.redirect(new URL('/chat', req.url));
  res.headers.set('Set-Cookie', buildSessionCookie(cookieToken, { secure }));
  return res;
}
