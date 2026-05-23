# mas-ai-advisor

Web chatbot for the public-facing MAS AI Advisor. **The chatbot's job is to produce a copy-pasteable prompt** the user takes into ChatGPT, Claude, Gemini, or whatever AI they use — not to run an end-to-end discovery in browser. The conversation is finite by design: read the user's opener, do a short discovery if needed, collect enough context, then synthesize a thorough custom prompt as the final turn.

**v1 scope (2026-05-23)**: chatbot only at `advisor.masadvise.org/chat` (iframed into `masadvise.org/ai`), calling Anthropic via OpenRouter (BYOK on MAS's account), rate-limited and spend-capped, for the 2026-06-04 workshop.

**On hold**: install-elsewhere adapters (Custom GPT, Copilot Agent, Gemini Gem, Claude Project). The Claude Project MCP server + OAuth provider (PRs #12–18), SKILL.md bundle adapter (PR #18), and Custom GPT bundle script (PR #6) ship in this repo but are **not exercised in v1**. Pattern A may resume post-workshop based on chatbot signal — explicit decision gate in spec Phase 4.

**Spec**: `~/gdrive-brianpkm/3-Resources/mas-ai-advisor-spec.md`
**Chatbot build plan**: `~/gdrive-brianpkm/3-Resources/mas-ai-chatbot-build-plan.md`

## The conversation arc

1. **Read the opener.** Focused (*"we want to find foundations to apply to for grants"*) → confirm in one sentence, go to context. Vague (*"hi help us with AI"*) → short discovery (2-3 turns) to land a focus area.
2. **Gather context** — role, org, mission, what they've tried, constraints, AI tool of choice. 4-6 well-aimed questions.
3. **Synthesize** (final turn, triggered by the application at cap-hit): a 3-5 sentence summary + a thorough copy-pasteable prompt wrapped in `<USER_PROMPT>...</USER_PROMPT>` tags. The UI surfaces a "Get your custom AI prompt" reveal button (with copy-icon) and a "Contact MAS" button.

## Stack

- Next.js 16 (App Router)
- TypeScript 5 strict, Node ≥20
- Postgres via `pg` (Azure target, `mas` database, `mas_ai_advisor` role)
- OpenRouter (BYOK to Anthropic) — `anthropic/claude-haiku-4.5` with `cache_control` passthrough; synthesis call bumps `maxTokens` to 2500 to fit a long prompt
- `zod` v4 for input validation
- `vitest` for tests
- pnpm

## Surfaces

### Active (v1)

| Endpoint | Purpose |
|---|---|
| `POST /api/chat/session/start` | Chatbot consent submission. reCAPTCHA verify → idempotent `registerInstall` → HMAC-signed one-time session token. |
| `GET /api/chat/session/exchange?t=<token>` | Token-for-cookie exchange (Server Components can't set cookies in Next.js 15+). 302s to `/chat`. |
| `POST /api/chat/turn` | Per-turn handler. Privacy-intent detect → kill-switch + cap → OpenRouter call (cache_control on system+KB block). At cap-hit, runs a synthesis call with the `SYNTHESIZE NOW` directive appended and returns `{ reply: summary, prompt_text, completion: true }`. |
| `GET /chat` | Chat UI page. Verifies session cookie, renders `ChatWindow`. |
| `POST /api/install/register` | First-turn consent submission (shared handler). Idempotent on `install_id`. |
| `POST /api/conversation/turn` | Per-turn event (chatbot turn handler routes through this). |
| `POST /api/conversation/private` | Conversation-private intent: pause / resume / forget. |

Telemetry endpoints require `X-API-Key`. Chatbot session uses HMAC-signed session tokens + HttpOnly cookies.

Cross-origin POST from `www.masadvise.org` to `advisor.masadvise.org` is handled by `middleware.ts` (CORS on `/api/chat/*`).

### Dormant (Pattern A on hold)

The repo contains code for the install-elsewhere adapter scaffolding — these surfaces are NOT exercised in v1, kept for the eventual resume:

- `app/api/mcp/` — streamable-HTTP MCP server for the Claude Project adapter
- OAuth 2.1 provider layer (`/.well-known/...`, `/oauth/authorize`, `/oauth/token`, `/oauth/register`)
- `adapters/claude-project/` — MCP + system-prompt bundle
- `adapters/skill/` — SKILL.md cross-platform bundle
- `adapters/custom-gpt/` — Custom GPT manifest + upload-payload builder

Do not publish these to their respective platforms without an explicit Pattern-A resume decision.

## Local development

```bash
pnpm install
cp .env.example .env.local      # then fill MAS_ADVISOR_DATABASE_URL + MAS_ADVISOR_API_KEY + OPENROUTER_API_KEY + RECAPTCHA + SESSION_TOKEN_SECRET + IP_HASH_SALT + CHATBOT_TC_VERSION
pnpm dev                        # http://localhost:3000
pnpm test                       # vitest run
pnpm typecheck                  # tsc --noEmit
```

## Database migrations

Applied against the MAS Postgres `mas` database:

- `migrations/000_create_mas_journey_tables.sql` — foundation tables
- `migrations/001_add_install_consent_columns.sql` — `email`, `share_history` on `mas_journey_installs`
- `migrations/002_create_mas_ai_advisor_role.sql` — scoped role with INSERT/SELECT/DELETE grants
- `migrations/003_create_chatbot_tables.sql` — chatbot operational tables: `chatbot_rate_limits`, `chatbot_conversations`, `chatbot_spend`, `chatbot_kill_switch`, plus `tc_version` on `mas_journey_installs`

## Deployment

Target: Vercel, project `mas-ai-advisor` under `briangflett` team. Auto-deploys on push to `main`.

## Roadmap

- **Phase 0** ✅ Foundation: API routes, schemas, migrations.
- **Phase 1** ✅ (system prompt v0.2): chatbot conversation arc + synthesis output format.
- **Phase 2** (active) — Web chatbot surface live: rate-limit + spend + kill-switch + OpenRouter wrapper + chat UI + WP consent form embed + cap-hit synthesis + copy-icon.
- **Phase 2 on hold** — Install-elsewhere adapter publishes to four platforms.
- **Phase 3** — Workshop pilot 2026-06-04 (chatbot only; deliverable = copy-pasteable prompt per attendee).
- **Phase 4** — Post-workshop iteration + Pattern-A resume-or-hold decision.
- **Phase 5** — Maintenance + feedback-loop digest email.
