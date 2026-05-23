import { cookies } from 'next/headers';
import { verifySessionToken } from '@/lib/chatbot/session-token';
import { SESSION_COOKIE_NAME } from '@/lib/chatbot/cookies';
import ChatWindow from './ChatWindow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Token-for-cookie exchange happens in /api/chat/session/exchange (Route
// Handler — Server Components cannot set cookies in Next.js 15+). The iframe
// hits that route first, which writes the cookie and 302s here.
export default async function ChatPage() {
  const cookieStore = await cookies();
  const sessionSecret = process.env.SESSION_TOKEN_SECRET;

  if (!sessionSecret) {
    return (
      <ErrorShell title="Server misconfigured">
        <p>The chat service is not configured. Please try again later, or email <a href="mailto:info@masadvise.org">info@masadvise.org</a>.</p>
      </ErrorShell>
    );
  }

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

