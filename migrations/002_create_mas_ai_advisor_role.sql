-- mas-ai-advisor Phase 0
-- Create the mas_ai_advisor Postgres role with scoped grants on mas_journey_* tables.
--
-- The deployed mas-ai-advisor app connects as this role (NOT as the brian admin).
-- Role password is supplied via the psql `-v role_password='...'` variable at
-- apply time and is then stored in Azure Key Vault under
-- Azure-PG-Mas-Advisor-Password. The migration file itself contains no credentials.
--
-- Grants:
--   * mas_journey_installs: SELECT (turn endpoint reads share_history),
--                           INSERT (register endpoint).
--                           No UPDATE/DELETE — installs are never modified after creation.
--   * mas_journey_events:   SELECT, INSERT (all three endpoints write events),
--                           DELETE (private endpoint deletes prior turn events).
--   * mas_journey_events_id_seq: USAGE + SELECT (required for BIGSERIAL inserts).
--
-- One-shot — re-running will fail at CREATE ROLE since the role already exists.
-- To rotate the password later, do not re-run this file; use ALTER ROLE directly
-- (recipe at the bottom).

\set ON_ERROR_STOP on

BEGIN;

CREATE ROLE mas_ai_advisor WITH LOGIN PASSWORD :'role_password';

GRANT CONNECT ON DATABASE mas    TO mas_ai_advisor;
GRANT USAGE   ON SCHEMA   public TO mas_ai_advisor;

GRANT SELECT, INSERT         ON mas_journey_installs TO mas_ai_advisor;
GRANT SELECT, INSERT, DELETE ON mas_journey_events   TO mas_ai_advisor;

GRANT USAGE, SELECT ON SEQUENCE mas_journey_events_id_seq TO mas_ai_advisor;

COMMIT;

-- To rotate the password later (NOT part of this migration — run as admin):
--   NEW_PWD=$(openssl rand -hex 24)
--   PGPASSWORD=$(az keyvault secret show --vault-name mas-n8n-kv --name Azure-PG-Admin-Password --query value -o tsv) \
--     psql 'host=...port=5432 user=brian dbname=mas sslmode=require' \
--     -v new_pwd="$NEW_PWD" \
--     -c "ALTER ROLE mas_ai_advisor WITH PASSWORD :'new_pwd';"
--   az keyvault secret set --vault-name mas-n8n-kv --name Azure-PG-Mas-Advisor-Password --value "$NEW_PWD"
--   unset NEW_PWD
