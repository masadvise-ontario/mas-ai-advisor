import { getPool, SCOPE } from '@/lib/db';
import type { RegisterBody } from '@/lib/schemas';
import type { RegisterInstallResult } from './types';

export async function registerInstall(
  body: RegisterBody,
): Promise<RegisterInstallResult> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO mas_journey_installs
         (install_id, scope, platform, email, share_history, source, tc_version, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (install_id) DO NOTHING`,
      [
        body.install_id,
        SCOPE,
        body.platform,
        body.email ?? null,
        body.share_history,
        body.source ?? null,
        body.tc_version ?? null,
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
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
