import type { ChatbotDb } from './types';

export async function isKilled(db: ChatbotDb): Promise<boolean> {
  const res = await db.query<{ killed: boolean }>(
    `SELECT killed FROM chatbot_kill_switch WHERE id = 1`,
  );
  if (!res.rowCount) return false;
  return res.rows[0].killed === true;
}
