import { NextRequest, NextResponse } from 'next/server';
import { getPool, SCOPE } from '@/lib/db';
import { checkApiKey } from '@/lib/auth';
import { registerBodySchema } from '@/lib/schemas';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = checkApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  const parsed = registerBodySchema.safeParse(await req.json().catch(() => null));
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
    await client.query(
      `INSERT INTO mas_journey_installs
         (install_id, scope, platform, email, share_history, source, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (install_id) DO NOTHING`,
      [
        body.install_id,
        SCOPE,
        body.platform,
        body.email ?? null,
        body.share_history,
        body.source ?? null,
      ],
    );
    await client.query(
      `INSERT INTO mas_journey_events
         (install_id, scope, event_type, payload, created_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [
        body.install_id,
        SCOPE,
        'advisor_install_registered',
        JSON.stringify({
          platform: body.platform,
          share_history: body.share_history,
          email_provided: Boolean(body.email),
          source: body.source ?? null,
        }),
      ],
    );
    await client.query('COMMIT');
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[register] error', err);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  } finally {
    client.release();
  }
}
