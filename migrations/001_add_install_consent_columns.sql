-- mas-ai-advisor Phase 0
-- Extend mas_journey_installs with first-turn consent fields.
-- Apply against the MAS Postgres database (`mas` on mas-n8n-postgress-db).

BEGIN;

-- Two new columns: email (optional) and share_history (required yes/no).
-- The DEFAULT on share_history is only for the existing-row backfill;
-- the application will always supply an explicit value going forward.
ALTER TABLE mas_journey_installs
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS share_history BOOLEAN NOT NULL DEFAULT FALSE;

-- Drop the backfill default so new rows must specify share_history explicitly.
ALTER TABLE mas_journey_installs
  ALTER COLUMN share_history DROP DEFAULT;

-- Verify mas_journey_installs.install_id is uniquely constrained so /register can
-- rely on ON CONFLICT semantics. This SELECT must return at least one row.
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'mas_journey_installs'::regclass
  AND contype IN ('p', 'u');

COMMIT;
