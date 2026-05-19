-- mas-ai-advisor — chatbot (Pattern B) surface
-- Tables to back the rate-limited public chatbot on ai.masadvise.org/mas-ai-advisor/chat.
-- Apply against the MAS Postgres database (`mas` on mas-n8n-postgress-db).
-- The mas_ai_advisor role already has access to mas_journey_*; new tables are
-- granted explicitly below.

BEGIN;

-- Track the Terms & Conditions version a user accepted at consent time.
-- NULL for legacy install-elsewhere rows (consent predates the column);
-- set for chatbot-surface registrations and any future install-elsewhere
-- adapter that ships a T&C agreement.
ALTER TABLE mas_journey_installs
  ADD COLUMN IF NOT EXISTS tc_version TEXT;

-- Per-IP, per-day conversation start counter. Atomic UPSERT pattern
-- short-circuits on conversation_cap so application code does not need
-- a separate read-then-write race window.
CREATE TABLE IF NOT EXISTS chatbot_rate_limits (
  ip_hash TEXT NOT NULL,
  day_anchor DATE NOT NULL,
  conversations_started INT NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, day_anchor)
);

-- Per-conversation turn counter + per-conversation token accounting.
-- One row per chatbot conversation; rate-limit uses turn_count, billing
-- uses the cumulative token columns.
CREATE TABLE IF NOT EXISTS chatbot_conversations (
  conversation_id UUID PRIMARY KEY,
  install_id UUID NOT NULL,
  ip_hash TEXT NOT NULL,
  turn_count INT NOT NULL DEFAULT 0,
  total_input_tokens INT NOT NULL DEFAULT 0,
  total_cached_input_tokens INT NOT NULL DEFAULT 0,
  total_output_tokens INT NOT NULL DEFAULT 0,
  upstream_cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_turn_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chatbot_conversations_ip_created_idx
  ON chatbot_conversations (ip_hash, created_at);

-- Daily spend aggregate for budget monitoring and the $50 soft / $90 hard
-- kill-switch checks. Row keyed by UTC date.
CREATE TABLE IF NOT EXISTS chatbot_spend (
  day_anchor DATE PRIMARY KEY,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  cached_input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  upstream_cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0
);

-- Single-row kill switch table. The id = 1 check + ON CONFLICT INSERT below
-- guarantee exactly one row; application code reads WHERE id = 1.
CREATE TABLE IF NOT EXISTS chatbot_kill_switch (
  id INT PRIMARY KEY CHECK (id = 1),
  killed BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO chatbot_kill_switch (id, killed)
  VALUES (1, FALSE)
  ON CONFLICT (id) DO NOTHING;

-- Grant the scoped application role read+write on the new tables.
-- mas_ai_advisor already has SELECT/INSERT/UPDATE on mas_journey_*.
GRANT SELECT, INSERT, UPDATE ON
  chatbot_rate_limits,
  chatbot_conversations,
  chatbot_spend,
  chatbot_kill_switch
TO mas_ai_advisor;

COMMIT;
