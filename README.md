# mas-ai-advisor

Web chatbot + telemetry API for the public-facing MAS AI Advisor.

**v1 scope (2026-05-22)**: chatbot only. The web chatbot at `advisor.masadvise.org/chat` (iframed into `masadvise.org/ai`) calls Anthropic via OpenRouter (BYOK on MAS's account), rate-limited and spend-capped, for the 2026-06-04 workshop.

**On hold**: install-elsewhere adapters (Custom GPT, Copilot Agent, Gemini Gem, Claude Project). The Claude Project MCP server + OAuth provider (PRs #12–18), SKILL.md bundle adapter (PR #18), and Custom GPT bundle script (PR #6) ship in this repo but are **not exercised in v1**. Pattern A may resume post-workshop based on chatbot signal — explicit decision gate in spec Phase 4.

**Spec**: `~/gdrive-brianpkm/3-Resources/mas-ai-advisor-spec.md`
**Chatbot build plan**: `~/gdrive-brianpkm/3-Resources/mas-ai-chatbot-build-plan.md`

## Stack

- Next.js 16 (App Router)
- TypeScript 5 strict, Node ≥20
- Postgres via `pg` (Azure target, `mas` database, `mas_ai_advisor` role)
- OpenRouter (BYOK to Anthropic) for the chatbot LLM — `anthropic/claude-haiku-4.5` with `cache_control` passthrough
- `zod` v4 for input validation
- `vitest` for tests
- pnpm

## Surfaces

### Active (v1)

| Endpoint | Purpose |
|---|---|
| `POST /api/chat/session/start` | Chatbot consent submission. reCAPTCHA verify → idempotent `registerInstall` → HMAC-signed one-time session token. |
| `POST /api/chat/turn` | Chatbot per-turn. Kill-switch + cap checks → OpenRouter call (cache_control on system+KB block) → `recordTurn` + spend write. |
| `GET /chat` | Chat UI page. Exchanges URL token for session cookie. |
| `POST /api/install/register` | First-turn consent submission (shared handler). Idempotent on `install_id`. |
| `POST /api/conversation/turn` | Per-turn event (chatbot turn handler routes through this). |
| `POST /api/conversation/private` | Conversation-private intent: pause / resume / forget. |

All telemetry endpoints require `X-API-Key` matching `MAS_ADVISOR_API_KEY`. Cap-hit experience surfaces a **single CTA** → `masadvise.org/contact-us` (engage MAS).

### Dormant (Pattern A on hold)

The repo contains code for the install-elsewhere adapter scaffolding — these surfaces are NOT exercised in v1, but are kept intact for the eventual resume:

- `app/api/mcp/` — streamable-HTTP MCP server for the Claude Project adapter
- OAuth 2.1 provider layer (`/.well-known/...`, `/oauth/authorize`, `/oauth/token`, `/oauth/register`)
- `adapters/claude-project/` — MCP + system-prompt bundle
- `adapters/skill/` — SKILL.md cross-platform bundle
- `adapters/custom-gpt/` — Custom GPT manifest + upload-payload builder

Do not publish these to their respective platforms without an explicit Pattern-A resume decision.

## Local development

```bash
pnpm install
cp .env.example .env.local      # then fill MAS_ADVISOR_DATABASE_URL + MAS_ADVISOR_API_KEY + OPENROUTER_API_KEY + RECAPTCHA keys
pnpm dev                        # http://localhost:3000
pnpm test                       # vitest run
pnpm typecheck                  # tsc --noEmit
```

## Database migrations

Applied against the MAS Postgres `mas` database:

- `migrations/000_create_mas_journey_tables.sql` — foundation tables
- `migrations/001_add_install_consent_columns.sql` — `email`, `share_history` on `mas_journey_installs`
- `migrations/002_create_mas_ai_advisor_role.sql` — scoped role with INSERT/SELECT/DELETE grants

Migration 003 (chatbot operational tables — `chatbot_rate_limits`, `chatbot_conversations`, `chatbot_spend`, `chatbot_kill_switch`, plus `tc_version` on `mas_journey_installs`) lands during Phase 2 chatbot build.

## Deployment

Target: Vercel. Production account TBD (see spec Open Questions).

## Roadmap

- **Phase 0** ✅ Foundation: API routes, schemas, migration.
- **Phase 1** ✅ Author `prompts/system.md`, `knowledge/` manifest, `tests/probe-set/`.
- **Phase 2** (active) — Web chatbot surface: rate-limit + spend + kill-switch + OpenRouter wrapper + chat UI + WP consent form embed.
- **Phase 2 on hold** — Install-elsewhere adapter publishes to four platforms.
- **Phase 3** — Workshop pilot 2026-06-04 (chatbot only).
- **Phase 4** — Post-workshop iteration + Pattern-A resume-or-hold decision.
- **Phase 5** — Maintenance + feedback-loop digest email.
