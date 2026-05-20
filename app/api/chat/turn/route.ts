import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPool } from '@/lib/db';
import { recordTurn, setConversationPrivacy } from '@/lib/handlers';
import { chatTurnSchema } from '@/lib/schemas';
import { isKilled } from '@/lib/chatbot/kill-switch';
import { checkAndIncrementTurn } from '@/lib/chatbot/rate-limit';
import { chatCompletion } from '@/lib/chatbot/openrouter';
import { recordTurnUsage } from '@/lib/chatbot/spend';
import { verifySessionToken } from '@/lib/chatbot/session-token';
import { SESSION_COOKIE_NAME } from '@/lib/chatbot/cookies';
import { detectPrivacyIntent, getConversationPrivacyState } from '@/lib/chatbot/privacy-intent';
import { getChatbotSystemPrompt } from '@/lib/chatbot/system-prompt';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const sessionSecret = process.env.SESSION_TOKEN_SECRET;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!sessionSecret || !openrouterKey) {
    console.error('[chat/turn] missing SESSION_TOKEN_SECRET or OPENROUTER_API_KEY');
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

  const parsed = chatTurnSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { messages } = parsed.data;
  const latestUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

  const pool = getPool();

  if (await isKilled(pool)) {
    return NextResponse.json(
      { error: 'service_paused', reply: "The MAS advisor is briefly paused while we refresh. Please come back later." },
      { status: 503 },
    );
  }

  // Privacy intent: detect first, act before the turn so the user's pause
  // request takes effect from this turn forward.
  const intent = detectPrivacyIntent(latestUserMessage);
  if (intent) {
    try {
      await setConversationPrivacy({
        install_id: session.install_id,
        conversation_id: session.conversation_id,
        action: intent,
      });
    } catch (err) {
      console.error('[chat/turn] privacy intent handler error', err);
      // Fail closed for pause/forget: refuse the turn rather than risk leaking it.
      if (intent !== 'resume') {
        return NextResponse.json(
          { error: 'privacy_update_failed', reply: "I tried to update your privacy setting but couldn't reach the server. Please try again, or email info@masadvise.org if it keeps failing." },
          { status: 500 },
        );
      }
    }
  }

  // Turn cap check (after privacy intent so pause/forget don't burn turns).
  const turnCheck = await checkAndIncrementTurn(pool, session.conversation_id);
  if (!turnCheck.ok) {
    return NextResponse.json(
      {
        error: 'turn_cap',
        reply:
          "We've reached the conversation length cap. Three ways to go deeper: (1) engage MAS directly at masadvise.org/contact-us, (2) install the Advisor in your own LLM from masadvise.org/install-advisor, or (3) support MAS at masadvise.org/donate.",
      },
      { status: 429 },
    );
  }

  let completion: Awaited<ReturnType<typeof chatCompletion>>;
  try {
    completion = await chatCompletion({
      apiKey: openrouterKey,
      systemText: getChatbotSystemPrompt(),
      messages,
    });
  } catch (err) {
    console.error('[chat/turn] openrouter error', err);
    return NextResponse.json({ error: 'llm_error' }, { status: 502 });
  }

  // Spend tracking — fire-and-forget; failures must not block the reply.
  recordTurnUsage(pool, {
    conversationId: session.conversation_id,
    inputTokens: completion.usage.inputTokens,
    cachedInputTokens: completion.usage.cachedInputTokens,
    outputTokens: completion.usage.outputTokens,
    upstreamCostUsd: completion.usage.upstreamCostUsd,
  }).catch((err) => console.error('[chat/turn] spend write failed', err));

  // Telemetry — only if the conversation isn't paused/forgotten.
  const privacyState = await getConversationPrivacyState(
    pool,
    session.install_id,
    session.conversation_id,
  );
  if (privacyState === 'active') {
    recordTurn({
      install_id: session.install_id,
      conversation_id: session.conversation_id,
      event_subtype: 'turn_started',
      payload: {
        platform: 'web',
        intent: intent ?? undefined,
      },
    }).catch((err) => console.error('[chat/turn] recordTurn failed', err));
  }

  return NextResponse.json({
    reply: completion.reply,
    turns_remaining: turnCheck.remaining ?? 0,
  });
}
