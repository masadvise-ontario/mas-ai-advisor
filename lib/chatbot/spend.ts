import type { ChatbotDb } from './types';

export interface TurnUsage {
  conversationId: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  upstreamCostUsd: number;
}

// Writes both the per-conversation cumulative columns and the daily aggregate
// in chatbot_spend. Two statements; not wrapped in a transaction because the
// chatbot_spend row is fire-and-forget for monitoring (a missed row is a small
// undercount, not a billing error).
export async function recordTurnUsage(
  db: ChatbotDb,
  usage: TurnUsage,
): Promise<void> {
  await db.query(
    `UPDATE chatbot_conversations
     SET total_input_tokens = total_input_tokens + $2,
         total_cached_input_tokens = total_cached_input_tokens + $3,
         total_output_tokens = total_output_tokens + $4,
         upstream_cost_usd = upstream_cost_usd + $5
     WHERE conversation_id = $1`,
    [
      usage.conversationId,
      usage.inputTokens,
      usage.cachedInputTokens,
      usage.outputTokens,
      usage.upstreamCostUsd,
    ],
  );
  await db.query(
    `INSERT INTO chatbot_spend (day_anchor, input_tokens, cached_input_tokens, output_tokens, upstream_cost_usd)
     VALUES (CURRENT_DATE, $1, $2, $3, $4)
     ON CONFLICT (day_anchor) DO UPDATE
       SET input_tokens = chatbot_spend.input_tokens + EXCLUDED.input_tokens,
           cached_input_tokens = chatbot_spend.cached_input_tokens + EXCLUDED.cached_input_tokens,
           output_tokens = chatbot_spend.output_tokens + EXCLUDED.output_tokens,
           upstream_cost_usd = chatbot_spend.upstream_cost_usd + EXCLUDED.upstream_cost_usd`,
    [
      usage.inputTokens,
      usage.cachedInputTokens,
      usage.outputTokens,
      usage.upstreamCostUsd,
    ],
  );
}

export async function getDailySpendUsd(
  db: ChatbotDb,
  day: string = 'CURRENT_DATE',
): Promise<number> {
  const res = await db.query<{ upstream_cost_usd: string }>(
    day === 'CURRENT_DATE'
      ? `SELECT upstream_cost_usd FROM chatbot_spend WHERE day_anchor = CURRENT_DATE`
      : `SELECT upstream_cost_usd FROM chatbot_spend WHERE day_anchor = $1::date`,
    day === 'CURRENT_DATE' ? [] : [day],
  );
  if (!res.rowCount) return 0;
  return parseFloat(res.rows[0].upstream_cost_usd);
}
