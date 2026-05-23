-- mas-ai-advisor — message logging + feedback (thumbs/comments)
-- Adds two chatbot-side tables so Brian can read actual conversations
-- and capture user feedback per assistant message.
-- Apply against the MAS Postgres database (`mas` on mas-n8n-postgress-db).

BEGIN;

-- Per-message log. Populated by /api/chat/turn for both the user message
-- (the one the visitor just sent) and the assistant reply, but ONLY when
-- the install opted into share_history AND the conversation is not paused
-- or forgotten. Anonymous / private conversations leave no rows here.
--
-- message_index is 0-based and monotonic within the conversation: index 0
-- is the visitor's first message, index 1 is the assistant's first reply,
-- and so on. Gaps possible if the user paused mid-conversation.
CREATE TABLE IF NOT EXISTS chatbot_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL,
  install_id UUID NOT NULL,
  message_index INT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, message_index)
);

CREATE INDEX IF NOT EXISTS chatbot_messages_conversation_idx
  ON chatbot_messages (conversation_id, message_index);

CREATE INDEX IF NOT EXISTS chatbot_messages_install_idx
  ON chatbot_messages (install_id, created_at);

-- Per-message feedback. Unlike message logging, feedback is ALWAYS
-- captured regardless of share_history — the act of submitting feedback
-- is explicit consent for that single artifact. The feedback row may
-- reference a message that wasn't itself logged (e.g. anonymous visitor),
-- which is acceptable; we just won't be able to join back to content.
--
-- assistant_message_index is the index of the assistant message the
-- feedback is about. Multiple feedback rows per message are allowed
-- (visitor changes their mind) — readers should typically take the most
-- recent. rating may be NULL when the visitor submitted a comment-only
-- feedback (mirroring the mas-vc-chatbot UX which has a separate "leave
-- a comment" button alongside the thumbs).
CREATE TABLE IF NOT EXISTS chatbot_feedback (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL,
  install_id UUID NOT NULL,
  assistant_message_index INT NOT NULL,
  rating TEXT CHECK (rating IN ('up', 'down')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (rating IS NOT NULL OR comment IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS chatbot_feedback_conversation_idx
  ON chatbot_feedback (conversation_id, assistant_message_index);

CREATE INDEX IF NOT EXISTS chatbot_feedback_rating_created_idx
  ON chatbot_feedback (rating, created_at);

-- The mas_ai_advisor role needs INSERT/SELECT on both new tables.
GRANT SELECT, INSERT ON chatbot_messages, chatbot_feedback TO mas_ai_advisor;
GRANT USAGE, SELECT ON SEQUENCE chatbot_messages_id_seq, chatbot_feedback_id_seq TO mas_ai_advisor;

COMMIT;
