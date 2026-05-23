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
import {
  detectPrivacyIntent,
  detectPrivacyMarker,
  getConversationPrivacyState,
} from '@/lib/chatbot/privacy-intent';
import { getChatbotSystemPrompt, parseSynthesis } from '@/lib/chatbot/system-prompt';
import { logChatbotMessage, getShareHistory } from '@/lib/chatbot/messages-log';

const SYNTHESIS_MAX_TOKENS = 4000;

// Default max_tokens for normal (non-cap-hit) turns. Bumped from 800 (the
// chatCompletion default) because the LLM frequently volunteers a synthesis
// before the cap is reached — and 800 tokens can't fit a 200-500 word
// USER_PROMPT block plus a summary, leading to mid-sentence truncation,
// failed parseSynthesis, no completion: true, and the conversation
// continuing past where it should have closed.
const TURN_MAX_TOKENS = 2500;

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
  // On cap-hit, we don't refuse the turn — instead we run a one-shot
  // synthesis call that produces the summary + USER_PROMPT block, and tell
  // the UI to render the completion experience.
  const turnCheck = await checkAndIncrementTurn(pool, session.conversation_id);
  const synthesisMode = !turnCheck.ok;

  let completion: Awaited<ReturnType<typeof chatCompletion>>;
  try {
    completion = await chatCompletion({
      apiKey: openrouterKey,
      systemText: getChatbotSystemPrompt({ synthesisMode }),
      messages,
      maxTokens: synthesisMode ? SYNTHESIS_MAX_TOKENS : TURN_MAX_TOKENS,
    });
  } catch (err) {
    console.error('[chat/turn] openrouter error', err);
    return NextResponse.json({ error: 'llm_error' }, { status: 502 });
  }

  // Belt-and-suspenders privacy detection: if the LLM acknowledged a
  // privacy intent in its reply (via the [PRIVACY:pause|resume|forget]
  // marker), apply that too. Catches cases where the user's phrasing
  // didn't match the regex but the LLM understood. The marker is
  // stripped from the visible reply.
  const markerHit = detectPrivacyMarker(completion.reply);
  if (markerHit && markerHit.action !== intent) {
    try {
      await setConversationPrivacy({
        install_id: session.install_id,
        conversation_id: session.conversation_id,
        action: markerHit.action,
      });
      console.info(`[chat/turn] privacy marker from LLM: ${markerHit.action}`);
    } catch (err) {
      console.error('[chat/turn] LLM marker handler error', err);
    }
  }
  if (markerHit) {
    completion.reply = markerHit.cleaned;
  }
  const effectiveIntent = intent ?? markerHit?.action ?? null;

  // Spend tracking — fire-and-forget; failures must not block the reply.
  recordTurnUsage(pool, {
    conversationId: session.conversation_id,
    inputTokens: completion.usage.inputTokens,
    cachedInputTokens: completion.usage.cachedInputTokens,
    outputTokens: completion.usage.outputTokens,
    upstreamCostUsd: completion.usage.upstreamCostUsd,
  }).catch((err) => console.error('[chat/turn] spend write failed', err));

  // Telemetry + message logging — only if the install opted in AND the
  // conversation isn't paused/forgotten. Both gates apply.
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
        intent: effectiveIntent ?? undefined,
      },
    }).catch((err) => console.error('[chat/turn] recordTurn failed', err));

    // Per-message logging into chatbot_messages so the actual Q&A is
    // readable in the DB. Same opt-in gate as recordTurn.
    const shareHistory = await getShareHistory(pool, session.install_id);
    if (shareHistory) {
      // The user's message was the last in the request body; the
      // assistant's reply is the response we just composed. Compute the
      // pair of indices based on existing message count.
      const userMessageIndex = messages.length - 1;
      const assistantMessageIndex = messages.length;
      logChatbotMessage(pool, {
        conversationId: session.conversation_id,
        installId: session.install_id,
        messageIndex: userMessageIndex,
        role: 'user',
        content: latestUserMessage,
      }).catch((err) => console.error('[chat/turn] logChatbotMessage user failed', err));
      logChatbotMessage(pool, {
        conversationId: session.conversation_id,
        installId: session.install_id,
        messageIndex: assistantMessageIndex,
        role: 'assistant',
        content: completion.reply,
      }).catch((err) => console.error('[chat/turn] logChatbotMessage assistant failed', err));
    }
  }

  // Whether forced (cap-hit) or voluntary (LLM produced a USER_PROMPT block
  // mid-conversation because it had enough context), the synthesis closes
  // the conversation. The model is instructed to synthesize on its own as
  // soon as it has enough.
  const { summary, prompt } = parseSynthesis(completion.reply);
  if (prompt) {
    return NextResponse.json({
      reply: summary,
      prompt_text: prompt,
      completion: true,
      turns_remaining: 0,
    });
  }

  // Cap-hit synthesis call returned no USER_PROMPT (LLM didn't comply).
  // Surface the raw reply so the user isn't left with a blank message.
  if (synthesisMode) {
    return NextResponse.json({
      reply: completion.reply,
      completion: true,
      turns_remaining: 0,
    });
  }

  return NextResponse.json({
    reply: completion.reply,
    turns_remaining: turnCheck.remaining ?? 0,
  });
}
