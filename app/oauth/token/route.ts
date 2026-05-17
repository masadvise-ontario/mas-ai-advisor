/**
 * OAuth 2.1 token endpoint.
 *
 * Exchanges a one-shot authorization code for an access token. Public
 * client (no client_secret); PKCE binds the exchange to the client that
 * initiated the flow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { findClient } from '@/lib/oauth/clients';
import { consumeAuthorizationCode } from '@/lib/oauth/codes';
import { verifyPkceS256 } from '@/lib/oauth/pkce';
import { signAccessToken } from '@/lib/oauth/jwt';
import {
  OAUTH_ACCESS_TOKEN_TTL_SECONDS,
  getMcpResourceUri,
} from '@/lib/oauth/config';

export const runtime = 'nodejs';

function err(status: number, error: string, description: string) {
  return NextResponse.json(
    { error, error_description: description },
    { status },
  );
}

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? '';
  let body: Record<string, string> = {};
  if (ct.includes('application/x-www-form-urlencoded')) {
    body = Object.fromEntries(new URLSearchParams(await req.text()));
  } else if (ct.includes('application/json')) {
    const parsed = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    body = Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [k, String(v ?? '')]),
    );
  } else {
    return err(400, 'invalid_request', 'unsupported content-type');
  }

  if (body.grant_type !== 'authorization_code') {
    return err(
      400,
      'unsupported_grant_type',
      'only authorization_code is supported',
    );
  }

  const { code, client_id, redirect_uri, code_verifier } = body;
  const resource = body.resource ?? '';
  if (!code || !client_id || !redirect_uri || !code_verifier) {
    return err(400, 'invalid_request', 'missing required parameter');
  }

  const client = await findClient(client_id);
  if (!client) {
    return err(400, 'invalid_client', 'unknown client_id');
  }

  const record = await consumeAuthorizationCode(code);
  if (!record) {
    return err(400, 'invalid_grant', 'code expired or already used');
  }
  if (record.client_id !== client_id) {
    return err(400, 'invalid_grant', 'client_id mismatch');
  }
  if (record.redirect_uri !== redirect_uri) {
    return err(400, 'invalid_grant', 'redirect_uri mismatch');
  }
  if (record.resource && resource && record.resource !== resource) {
    return err(400, 'invalid_grant', 'resource mismatch');
  }
  if (record.code_challenge_method !== 'S256') {
    return err(400, 'invalid_grant', 'unsupported PKCE method');
  }
  if (!verifyPkceS256(code_verifier, record.code_challenge)) {
    return err(400, 'invalid_grant', 'PKCE verifier mismatch');
  }

  const access_token = await signAccessToken({
    sub: record.user_sub,
    email: record.user_email,
    email_verified: true,
    client_id,
    scope: record.scope,
    audience: record.resource ?? getMcpResourceUri(),
  });

  return NextResponse.json({
    access_token,
    token_type: 'Bearer',
    expires_in: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
    scope: record.scope,
  });
}
