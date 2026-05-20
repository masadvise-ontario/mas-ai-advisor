import type { ChatbotDb } from './types';

export const CONVERSATIONS_PER_IP_PER_DAY = 5;
export const TURNS_PER_CONVERSATION = 15;

export type RateLimitReason = 'conversation_cap' | 'turn_cap';

export interface RateLimitResult {
  ok: boolean;
  reason?: RateLimitReason;
  remaining?: number;
}

// Atomic UPSERT: increments only if conversations_started < limit. The
// WHERE-clause on the DO UPDATE means a capped row returns rowCount=0
// instead of incrementing, so a single round-trip both checks and writes.
export async function checkAndIncrementConversation(
  db: ChatbotDb,
  ipHash: string,
  limit: number = CONVERSATIONS_PER_IP_PER_DAY,
): Promise<RateLimitResult> {
  const res = await db.query<{ conversations_started: number }>(
    `INSERT INTO chatbot_rate_limits (ip_hash, day_anchor, conversations_started)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (ip_hash, day_anchor) DO UPDATE
       SET conversations_started = chatbot_rate_limits.conversations_started + 1
       WHERE chatbot_rate_limits.conversations_started < $2
     RETURNING conversations_started`,
    [ipHash, limit],
  );
  if (!res.rowCount) {
    return { ok: false, reason: 'conversation_cap' };
  }
  return { ok: true, remaining: limit - res.rows[0].conversations_started };
}

// Per-conversation turn cap. Assumes a chatbot_conversations row already
// exists (created by /api/chat/session/start). Atomic UPDATE pattern.
export async function checkAndIncrementTurn(
  db: ChatbotDb,
  conversationId: string,
  limit: number = TURNS_PER_CONVERSATION,
): Promise<RateLimitResult> {
  const res = await db.query<{ turn_count: number }>(
    `UPDATE chatbot_conversations
     SET turn_count = turn_count + 1,
         last_turn_at = NOW()
     WHERE conversation_id = $1
       AND turn_count < $2
     RETURNING turn_count`,
    [conversationId, limit],
  );
  if (!res.rowCount) {
    return { ok: false, reason: 'turn_cap' };
  }
  return { ok: true, remaining: limit - res.rows[0].turn_count };
}
