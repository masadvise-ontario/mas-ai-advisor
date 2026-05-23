import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPool } from '@/lib/db';
import { chatFeedbackSchema } from '@/lib/schemas';
import { verifySessionToken } from '@/lib/chatbot/session-token';
import { SESSION_COOKIE_NAME } from '@/lib/chatbot/cookies';

export const runtime = 'nodejs';

// POST /api/chat/feedback
// Captures a thumbs-up / thumbs-down / comment from the chat UI for a
// specific assistant message. The session cookie identifies the install +
// conversation; the body carries the message index and the rating/comment.
//
// Feedback is logged regardless of share_history — the act of submitting
// feedback is explicit consent for that single artifact. (Message content
// is only joinable when share_history was true; rows reference a
// message_index that may not exist in chatbot_messages otherwise.)
export async function POST(req: NextRequest) {
  const sessionSecret = process.env.SESSION_TOKEN_SECRET;
  if (!sessionSecret) {
    console.error('[chat/feedback] missing SESSION_TOKEN_SECRET');
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!sessionCookie?.value) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }
  const session = verifySessionToken(sessionCookie.value, sessionSecret);
  if (!session) {
    return NextResponse.json({ error: 'invalid_session' }, { status: 401 });
  }

  const parsed = chatFeedbackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO chatbot_feedback
         (conversation_id, install_id, assistant_message_index, rating, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        session.conversation_id,
        session.install_id,
        body.assistant_message_index,
        body.rating ?? null,
        body.comment?.trim() || null,
      ],
    );
  } catch (err) {
    console.error('[chat/feedback] insert failed', err);
    return NextResponse.json({ error: 'feedback_write_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
