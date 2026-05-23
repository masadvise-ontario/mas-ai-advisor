import type { ChatbotDb } from './types';

// Inserts a single message row into chatbot_messages. Caller is responsible
// for gating on share_history + privacy state — this function just writes.
//
// message_index is the absolute position in the conversation: 0 = first
// user message, 1 = first assistant reply, 2 = second user message, etc.
// Caller computes it from the count of prior messages already in flight.
//
// Idempotent on (conversation_id, message_index) via the table's UNIQUE
// constraint — re-inserting the same index is a silent no-op (ON CONFLICT).
export async function logChatbotMessage(
  db: ChatbotDb,
  params: {
    conversationId: string;
    installId: string;
    messageIndex: number;
    role: 'user' | 'assistant';
    content: string;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO chatbot_messages
       (conversation_id, install_id, message_index, role, content)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (conversation_id, message_index) DO NOTHING`,
    [
      params.conversationId,
      params.installId,
      params.messageIndex,
      params.role,
      params.content,
    ],
  );
}

// Looks up share_history for the install. Cached call site is the per-turn
// handler, so this is a single round trip; the value is stable for the
// life of the install row.
export async function getShareHistory(
  db: ChatbotDb,
  installId: string,
): Promise<boolean> {
  const res = await db.query<{ share_history: boolean }>(
    `SELECT share_history FROM mas_journey_installs WHERE install_id = $1`,
    [installId],
  );
  return res.rows[0]?.share_history ?? false;
}
