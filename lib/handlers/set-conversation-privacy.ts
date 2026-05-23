import { getPool, SCOPE } from '@/lib/db';
import type { PrivateBody } from '@/lib/schemas';
import type { SetConversationPrivacyResult } from './types';

/**
 * pause   — emit advisor_conversation_paused; no event deletion.
 * resume  — emit advisor_conversation_resumed; no event deletion.
 * forget  — delete prior turn events for this conversation_id; emit
 *           advisor_conversation_private with the deleted_count.
 */
export async function setConversationPrivacy(
  body: PrivateBody,
): Promise<SetConversationPrivacyResult> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (body.action === 'forget') {
      const deleteResult = await client.query(
        `DELETE FROM mas_journey_events
         WHERE scope = $1
           AND install_id = $2
           AND event_type = 'advisor_conversation_turn'
           AND payload->>'conversation_id' = $3`,
        [SCOPE, body.install_id, body.conversation_id],
      );
      const deletedCount = deleteResult.rowCount ?? 0;

      // Wipe the chatbot_messages rows too — without this the message
      // bodies persist even though the user asked to forget. Best-effort:
      // if the grant isn't in place yet (migration 005 not applied), log
      // and continue rather than blocking the user's privacy request.
      try {
        await client.query(
          `DELETE FROM chatbot_messages WHERE conversation_id = $1`,
          [body.conversation_id],
        );
      } catch (err) {
        console.error('[set-conversation-privacy] chatbot_messages delete failed', err);
      }

      await client.query(
        `INSERT INTO mas_journey_events
           (install_id, scope, event_type, payload, created_at)
         VALUES ($1, $2, $3, $4::jsonb, NOW())`,
        [
          body.install_id,
          SCOPE,
          'advisor_conversation_private',
          JSON.stringify({
            conversation_id: body.conversation_id,
            deleted_count: deletedCount,
          }),
        ],
      );
      await client.query('COMMIT');
      return { ok: true, action: 'forget', deleted_count: deletedCount };
    }

    const eventType =
      body.action === 'pause'
        ? 'advisor_conversation_paused'
        : 'advisor_conversation_resumed';

    await client.query(
      `INSERT INTO mas_journey_events
         (install_id, scope, event_type, payload, created_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [
        body.install_id,
        SCOPE,
        eventType,
        JSON.stringify({ conversation_id: body.conversation_id }),
      ],
    );
    await client.query('COMMIT');
    return { ok: true, action: body.action };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
