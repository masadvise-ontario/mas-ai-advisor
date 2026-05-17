import { randomBytes } from 'node:crypto';
import { getPool } from '@/lib/db';

export type OAuthClient = {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scope: string;
  created_at: Date;
  revoked_at: Date | null;
};

export async function findClient(
  clientId: string,
): Promise<OAuthClient | null> {
  const pool = getPool();
  const result = await pool.query<OAuthClient>(
    `SELECT client_id, client_name, redirect_uris, grant_types, response_types,
            token_endpoint_auth_method, scope, created_at, revoked_at
     FROM oauth_clients
     WHERE client_id = $1`,
    [clientId],
  );
  const row = result.rows[0];
  if (!row || row.revoked_at) return null;
  return row;
}

export type CreateClientArgs = {
  client_name: string;
  redirect_uris: string[];
  grant_types?: string[];
  response_types?: string[];
  scope?: string;
};

export async function createClient(
  args: CreateClientArgs,
): Promise<OAuthClient> {
  // Client IDs: 'mac_<32 hex>'. 'mac_' = mas-advisor-client; the prefix
  // makes them easy to grep out of logs.
  const clientId = `mac_${randomBytes(16).toString('hex')}`;
  const pool = getPool();
  const result = await pool.query<OAuthClient>(
    `INSERT INTO oauth_clients (
       client_id, client_name, redirect_uris,
       grant_types, response_types,
       token_endpoint_auth_method, scope
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING client_id, client_name, redirect_uris, grant_types, response_types,
               token_endpoint_auth_method, scope, created_at, revoked_at`,
    [
      clientId,
      args.client_name,
      args.redirect_uris,
      args.grant_types ?? ['authorization_code'],
      args.response_types ?? ['code'],
      'none',
      args.scope ?? 'mas-advisor-mcp',
    ],
  );
  return result.rows[0];
}
