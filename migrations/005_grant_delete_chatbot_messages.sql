-- mas-ai-advisor — privacy follow-up
-- The forget action now also deletes from chatbot_messages so the
-- visitor's data is fully wiped (not just the mas_journey_events
-- telemetry rows). Requires DELETE permission on chatbot_messages
-- for the mas_ai_advisor role; the original migration 004 only
-- granted SELECT + INSERT.

BEGIN;

GRANT DELETE ON chatbot_messages TO mas_ai_advisor;

COMMIT;
