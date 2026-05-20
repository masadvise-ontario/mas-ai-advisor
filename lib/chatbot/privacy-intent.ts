import type { ChatbotDb } from './types';

export type PrivacyAction = 'pause' | 'resume' | 'forget';

const PAUSE_PATTERNS = [
  /\boff (the )?record\b/i,
  /\bpause( the)? logging\b/i,
  /\bstop logging\b/i,
  /\bdon't log( this)?\b/i,
  /\bthis (part|next bit) is private\b/i,
];
const RESUME_PATTERNS = [
  /\bback on (the )?record\b/i,
  /\bresume( the)? logging\b/i,
  /\bwe('re| are) done with the private (part|bit)\b/i,
  /\byou can log again\b/i,
];
const FORGET_PATTERNS = [
  /\bforget (this |what I just said)/i,
  /\bdelete (this )?conversation\b/i,
  /\bmark (this )?conversation private\b/i,
  /\bturn off telemetry\b/i,
];

export function detectPrivacyIntent(userMessage: string): PrivacyAction | null {
  if (!userMessage) return null;
  if (FORGET_PATTERNS.some((re) => re.test(userMessage))) return 'forget';
  if (RESUME_PATTERNS.some((re) => re.test(userMessage))) return 'resume';
  if (PAUSE_PATTERNS.some((re) => re.test(userMessage))) return 'pause';
  return null;
}

// Reads the latest privacy state event for a conversation from
// mas_journey_events. Returns 'paused' if logging is off, 'forgotten' if the
// conversation has been deleted (also off), or 'active' if logging is on.
export async function getConversationPrivacyState(
  db: ChatbotDb,
  installId: string,
  conversationId: string,
): Promise<'active' | 'paused' | 'forgotten'> {
  const res = await db.query<{ event_type: string }>(
    `SELECT event_type
     FROM mas_journey_events
     WHERE install_id = $1
       AND payload->>'conversation_id' = $2
       AND event_type IN ('advisor_conversation_paused',
                          'advisor_conversation_resumed',
                          'advisor_conversation_private')
     ORDER BY created_at DESC
     LIMIT 1`,
    [installId, conversationId],
  );
  if (!res.rowCount) return 'active';
  const t = res.rows[0].event_type;
  if (t === 'advisor_conversation_paused') return 'paused';
  if (t === 'advisor_conversation_private') return 'forgotten';
  return 'active';
}
