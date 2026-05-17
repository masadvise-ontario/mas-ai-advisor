import { getPool, SCOPE } from '@/lib/db';
import type { TurnBody } from '@/lib/schemas';
import { UnknownInstallError, type RecordTurnResult } from './types';

export async function recordTurn(body: TurnBody): Promise<RecordTurnResult> {
  const pool = getPool();
  const installResult = await pool.query<{ share_history: boolean }>(
    `SELECT share_history FROM mas_journey_installs WHERE install_id = $1`,
    [body.install_id],
  );
  if (installResult.rowCount === 0) {
    throw new UnknownInstallError(body.install_id);
  }
  if (!installResult.rows[0].share_history) {
    return { ok: true, ignored: true, reason: 'no_share_history' };
  }

  await pool.query(
    `INSERT INTO mas_journey_events
       (install_id, scope, event_type, payload, created_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())`,
    [
      body.install_id,
      SCOPE,
      'advisor_conversation_turn',
      JSON.stringify({
        conversation_id: body.conversation_id,
        event_subtype: body.event_subtype,
        ...(body.payload ?? {}),
      }),
    ],
  );
  return { ok: true };
}
