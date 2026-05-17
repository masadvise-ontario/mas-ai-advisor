-- mas-ai-advisor Phase 2
-- OAuth 2.1 provider tables: dynamically-registered clients (RFC 7591) and
-- one-shot authorization codes (PKCE per RFC 7636).
-- Apply against the MAS Postgres database (`mas` on mas-n8n-postgress-db).
--
-- Role grants: the `mas_ai_advisor` role needs read/write on both tables.
-- (Run the GRANT block below as the database owner, not as mas_ai_advisor.)

BEGIN;

-- Dynamically-registered OAuth clients. claude.ai (and any other MCP client
-- that supports DCR) POSTs to /oauth/register to claim a client_id. Public
-- clients (no client_secret) per OAuth 2.1 + PKCE; secrets aren't useful for
-- browser-mediated flows and add operational drag.
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id           TEXT PRIMARY KEY,
  client_name         TEXT NOT NULL,
  redirect_uris       TEXT[] NOT NULL,
  grant_types         TEXT[] NOT NULL DEFAULT ARRAY['authorization_code'],
  response_types      TEXT[] NOT NULL DEFAULT ARRAY['code'],
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none', -- public client
  scope               TEXT NOT NULL DEFAULT 'mas-advisor-mcp',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Soft-delete column so we can disable clients without losing audit trail.
  revoked_at          TIMESTAMPTZ
);

-- One-shot authorization codes. Issued by /oauth/authorize, consumed by
-- /oauth/token. Single-use (deleted on consume), short-lived (60s typical),
-- with PKCE binding so the client that initiated the flow is the only one
-- that can complete it.
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code                TEXT PRIMARY KEY,
  client_id           TEXT NOT NULL REFERENCES oauth_clients(client_id),
  redirect_uri        TEXT NOT NULL,
  -- Identity captured at /authorize time so /token doesn't have to re-read
  -- the Auth.js session (which lives in the user's browser, not the client's).
  user_sub            TEXT NOT NULL,         -- stable user id (provider + id) from Auth.js
  user_email          TEXT NOT NULL,         -- verified email from upstream IdP
  -- PKCE binding. method is 'S256' (or 'plain' for legacy — we'll reject plain).
  code_challenge      TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL,
  -- Resource indicator per RFC 8707. We accept the MCP endpoint URL.
  resource            TEXT,
  scope               TEXT NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_codes_expires_at
  ON oauth_authorization_codes (expires_at);

-- Grants for the application role. Adjust the role name if your environment
-- uses a different name. Safe to re-run.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mas_ai_advisor') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_clients              TO mas_ai_advisor;
    GRANT SELECT, INSERT,         DELETE ON oauth_authorization_codes  TO mas_ai_advisor;
  END IF;
END
$$;

COMMIT;
