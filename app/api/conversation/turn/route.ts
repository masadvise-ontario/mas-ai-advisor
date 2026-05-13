import { NextRequest, NextResponse } from 'next/server';
import { getPool, SCOPE } from '@/lib/db';
import { checkApiKey } from '@/lib/auth';
import { turnBodySchema } from '@/lib/schemas';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = checkApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  const parsed = turnBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const pool = getPool();
  try {
    const installResult = await pool.query<{ share_history: boolean }>(
      `SELECT share_history FROM mas_journey_installs WHERE install_id = $1`,
      [body.install_id],
    );
    if (installResult.rowCount === 0) {
      return NextResponse.json({ error: 'unknown install_id' }, { status: 404 });
    }
    if (!installResult.rows[0].share_history) {
      // User did not consent to history sharing; silently no-op.
      return NextResponse.json({ ok: true, ignored: true });
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
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[turn] error', err);
    // Fail-open: tell the Advisor everything's fine so the conversation isn't interrupted.
    return NextResponse.json({ ok: false, error: 'server error' }, { status: 200 });
  }
}
