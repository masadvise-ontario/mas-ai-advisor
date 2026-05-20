import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { signSessionToken, verifySessionToken } from '@/lib/chatbot/session-token';
import { SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE_SECONDS } from '@/lib/chatbot/cookies';
import ChatWindow from './ChatWindow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ t?: string }>;
}

export default async function ChatPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const sessionSecret = process.env.SESSION_TOKEN_SECRET;

  if (!sessionSecret) {
    return (
      <ErrorShell title="Server misconfigured">
        <p>The chat service is not configured. Please try again later, or email <a href="mailto:info@masadvise.org">info@masadvise.org</a>.</p>
      </ErrorShell>
    );
  }

  // Path 1: arriving with a one-time token from /api/chat/session/start —
  // verify, swap for a session cookie, redirect to the clean URL.
  if (params.t) {
    const payload = verifySessionToken(params.t, sessionSecret);
    if (!payload) {
      return (
        <ErrorShell title="Session expired">
          <p>Your session token has expired. Please return to <a href="https://masadvise.org/ai">masadvise.org/ai</a> and start again.</p>
        </ErrorShell>
      );
    }
    // Re-sign with the longer-lived session cookie TTL.
    const cookieToken = signSessionToken(
      {
        install_id: payload.install_id,
        conversation_id: payload.conversation_id,
        ip_hash: payload.ip_hash,
      },
      sessionSecret,
      SESSION_COOKIE_MAX_AGE_SECONDS,
    );
    const h = await headers();
    const proto = h.get('x-forwarded-proto') ?? 'https';
    const secure = proto === 'https';
    cookieStore.set({
      name: SESSION_COOKIE_NAME,
      value: cookieToken,
      httpOnly: true,
      secure,
      sameSite: 'none',
      path: '/',
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    });
    // Strip the token from the URL.
    redirect('/chat');
  }

  // Path 2: arriving with no token — must have a valid session cookie.
  const existing = cookieStore.get(SESSION_COOKIE_NAME);
  if (!existing?.value || !verifySessionToken(existing.value, sessionSecret)) {
    return (
      <ErrorShell title="Please start at masadvise.org/ai">
        <p>You need to begin from the consent form at <a href="https://masadvise.org/ai">masadvise.org/ai</a>. That&apos;s where you tell us your email, agree to the Terms, and decide whether to share your conversation with MAS for improvements.</p>
      </ErrorShell>
    );
  }

  return <ChatWindow />;
}

function ErrorShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '4rem auto', padding: '0 1.5rem' }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>{title}</h1>
      <div style={{ fontSize: 16, lineHeight: 1.5, color: '#334155' }}>{children}</div>
    </main>
  );
}

