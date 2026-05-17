import { randomBytes } from 'node:crypto';
import { getPool } from '@/lib/db';
import { OAUTH_AUTHORIZATION_CODE_TTL_SECONDS } from './config';

export type AuthorizationCodeRecord = {
  code: string;
  client_id: string;
  redirect_uri: string;
  user_sub: string;
  user_email: string;
  code_challenge: string;
  code_challenge_method: string;
  resource: string | null;
  scope: string;
  expires_at: Date;
};

export type IssueCodeArgs = {
  client_id: string;
  redirect_uri: string;
  user_sub: string;
  user_email: string;
  code_challenge: string;
  code_challenge_method: string;
  resource: string | null;
  scope: string;
};

export async function issueAuthorizationCode(
  args: IssueCodeArgs,
): Promise<string> {
  const code = `mac_code_${randomBytes(24).toString('hex')}`;
  const pool = getPool();
  await pool.query(
    `INSERT INTO oauth_authorization_codes (
       code, client_id, redirect_uri, user_sub, user_email,
       code_challenge, code_challenge_method, resource, scope,
       expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() + ($10 || ' seconds')::interval)`,
    [
      code,
      args.client_id,
      args.redirect_uri,
      args.user_sub,
      args.user_email,
      args.code_challenge,
      args.code_challenge_method,
      args.resource,
      args.scope,
      String(OAUTH_AUTHORIZATION_CODE_TTL_SECONDS),
    ],
  );
  return code;
}

/**
 * Atomically consume an authorization code: DELETE … RETURNING. If the row
 * was already consumed, or is expired, returns null.
 */
export async function consumeAuthorizationCode(
  code: string,
): Promise<AuthorizationCodeRecord | null> {
  const pool = getPool();
  const result = await pool.query<AuthorizationCodeRecord>(
    `DELETE FROM oauth_authorization_codes
     WHERE code = $1
       AND expires_at > NOW()
     RETURNING code, client_id, redirect_uri, user_sub, user_email,
               code_challenge, code_challenge_method, resource, scope, expires_at`,
    [code],
  );
  return result.rows[0] ?? null;
}
