import { NextRequest, NextResponse } from 'next/server';
import { getPool, SCOPE } from '@/lib/db';
import { checkApiKey } from '@/lib/auth';
import { privateBodySchema } from '@/lib/schemas';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = checkApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  const parsed = privateBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const deleteResult = await client.query(
      `DELETE FROM mas_journey_events
       WHERE scope = $1
         AND install_id = $2
         AND event_type = 'advisor_conversation_turn'
         AND payload->>'conversation_id' = $3`,
      [SCOPE, body.install_id, body.conversation_id],
    );
    const deletedCount = deleteResult.rowCount ?? 0;

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
    return NextResponse.json({ ok: true, deleted_count: deletedCount });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[private] error', err);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  } finally {
    client.release();
  }
}
