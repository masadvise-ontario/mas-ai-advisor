import type { ChatbotDb } from './types';

export type PrivacyAction = 'pause' | 'resume' | 'forget';

const PAUSE_PATTERNS = [
  /\boff (the )?record\b/i,
  /\bpause( the)? logging\b/i,
  /\bstop( the)? logging\b/i,
  /\bstop recording\b/i,
  /\bdon'?t log( this| me)?\b/i,
  /\bdon'?t record( this| me)?\b/i,
  /\bthis (part|next bit) is private\b/i,
  /\bkeep this (private|between us|off the record)\b/i,
  /\bnot for the record\b/i,
  /\bprivate mode\b/i,
  /\bstop tracking\b/i,
  /\bdon'?t save( this| the conversation)?\b/i,
];
const RESUME_PATTERNS = [
  /\bback on (the )?record\b/i,
  /\bresume( the)? logging\b/i,
  /\bwe('re| are) done with the private (part|bit)\b/i,
  /\byou can log again\b/i,
  /\bturn (the )?logging back on\b/i,
  /\bstart logging again\b/i,
];
const FORGET_PATTERNS = [
  /\bforget (this|what I just said|everything|all of this)/i,
  /\bdelete (this )?conversation\b/i,
  /\bdelete everything\b/i,
  /\bmark (this )?conversation private\b/i,
  /\bturn off telemetry\b/i,
  /\bwipe (this|the) conversation\b/i,
  /\bpurge (this|the) conversation\b/i,
  /\berase (this|the) conversation\b/i,
  /\bremove (this|the) conversation\b/i,
];

export function detectPrivacyIntent(userMessage: string): PrivacyAction | null {
  if (!userMessage) return null;
  if (FORGET_PATTERNS.some((re) => re.test(userMessage))) return 'forget';
  if (RESUME_PATTERNS.some((re) => re.test(userMessage))) return 'resume';
  if (PAUSE_PATTERNS.some((re) => re.test(userMessage))) return 'pause';
  return null;
}

// Looks for an explicit privacy marker the LLM emits when acknowledging an
// intent. The LLM is instructed to append `[PRIVACY:pause]` / `[PRIVACY:resume]`
// / `[PRIVACY:forget]` (case-insensitive) on its own line when it tells the
// user it has paused/resumed/forgotten. The server treats the marker as
// authoritative — the LLM's natural-language understanding is more reliable
// than regex on user input for edge phrasings.
//
// Returns the action plus the reply text with the marker stripped (so the
// user never sees it). Returns null if no marker is present.
export function detectPrivacyMarker(reply: string): {
  action: PrivacyAction;
  cleaned: string;
} | null {
  if (!reply) return null;
  const re = /\[PRIVACY\s*:\s*(pause|resume|forget)\s*\]/i;
  const m = reply.match(re);
  if (!m) return null;
  const action = m[1].toLowerCase() as PrivacyAction;
  const cleaned = reply.replace(re, '').replace(/\n{3,}/g, '\n\n').trim();
  return { action, cleaned };
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
