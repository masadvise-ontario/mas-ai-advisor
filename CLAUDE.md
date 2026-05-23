# mas-ai-advisor — Claude Code Guide

## ⚠️ CRITICAL: Security

**NEVER commit secrets.** API keys and DB credentials live in Azure Key Vault (production) and `.env.local` (development; git-ignored). Use placeholders in `.env.example`.

Reference: @/home/brian/SECURITY.md

---

## Project Overview

**Purpose**: Web chatbot for the public-facing MAS AI Advisor. The chatbot at `advisor.masadvise.org/chat` (iframed into `masadvise.org/ai`) helps a nonprofit visitor identify where AI can help, gather enough context, and **produces a copy-pasteable prompt** the user takes into ChatGPT, Claude, Gemini, or whatever AI they use. Calls Anthropic via OpenRouter (BYOK on MAS's account).

**Status (2026-05-23)**:
- Phase 0 (telemetry API + schemas + migrations) ✅ on main.
- Phase 1 (system prompt v0.2: focus + context + synthesis → `<USER_PROMPT>` output) ✅ on main.
- Phase 2 chatbot build ✅ shipped — rate-limit, OpenRouter wrapper, chat UI, WP consent form embed, synthesis-on-cap-hit, copy-icon. Live in production.
- **Pattern A install-elsewhere on hold (2026-05-22)** — Claude Project MCP + OAuth (PRs #12-18), SKILL.md bundle (PR #18), Custom GPT bundle script (PR #6) all shipped to repo but NOT exercised in v1. Do not publish to ChatGPT / Copilot / Gemini / Claude Project platforms without an explicit resume decision. Revisit post-workshop.

**Working Directory**: `/home/brian/workspace/development/mas-ai-advisor`

**Spec (canonical source of truth)**: `~/gdrive-brianpkm/3-Resources/mas-ai-advisor-spec.md`
**Chatbot build plan**: `~/gdrive-brianpkm/3-Resources/mas-ai-chatbot-build-plan.md`

**Conversation deliverable**: a copy-pasteable prompt (wrapped in `<USER_PROMPT>...</USER_PROMPT>` tags) parsed by the application at synthesis time. The chatbot is upstream of the user's real AI work, not a replacement for it. Don't add features that try to do the work *inside* the chatbot (running actual analyses, drafting actual outputs, etc.) — those happen in the destination LLM after the user pastes the prompt.

**Cap-hit UI**: two buttons — (1) reveal-prompt with a copy-icon affordance; (2) Contact MAS → `masadvise.org/contact-us`. Don't add install-elsewhere or donate buttons to the cap-hit panel — decided 2026-05-22.

---

## Tech Stack

- TypeScript 5 strict, Node ≥20
- Next.js 16 (App Router)
- Postgres via `pg` (Azure target, `mas` database, `mas_ai_advisor` role)
- OpenRouter (BYOK to Anthropic) — `anthropic/claude-haiku-4.5` with `cache_control` passthrough
- `zod` v4 for input validation
- `vitest` for tests
- pnpm

```bash
pnpm install
pnpm dev          # next dev → http://localhost:3000
pnpm build        # next build
pnpm test         # vitest run
pnpm typecheck    # tsc --noEmit
pnpm lint
```

---

## Architecture (v1 — chatbot only)

Code-only chatbot + telemetry API (no n8n, per MAS exit-readiness preference). Postgres tables reused from `mas_journey_*` per BrianPKM `mas-journey-tracking-and-telemetry.md` plus chatbot operational tables (`chatbot_rate_limits`, `chatbot_conversations`, `chatbot_spend`, `chatbot_kill_switch`).

```
Visitor on masadvise.org/ai
  └── WP consent form (email + share_history + T&C + reCAPTCHA v3)
       └── POST /api/chat/session/start ──▶ session token
            └── iframe /api/chat/session/exchange?t=<token> ──▶ writes cookie, 302 → /chat
                 └── POST /api/chat/turn ──▶ OpenRouter (Haiku 4.5, cache_control) ──▶ MAS Postgres
                      └── (at cap) one synthesis call with SYNTHESIZE NOW directive → parse <USER_PROMPT> → return { completion: true, prompt_text }
```

Cap-hit UI: reveal-prompt button (copy icon) + Contact-MAS button.

**Dormant (Pattern A on hold)**: streamable-HTTP MCP server at `/api/mcp` + OAuth 2.1 provider layer in repo for the Claude Project adapter; not exercised in v1.

Auth: shared API key in `X-API-Key` header for telemetry endpoints; chatbot session uses HMAC-signed session tokens + HttpOnly cookies.

CORS for cross-origin POST from `www.masadvise.org` → `advisor.masadvise.org` handled by `middleware.ts` on `/api/chat/*`.

Deployment target: Vercel, `mas-ai-advisor` project. DB role `mas_ai_advisor` against `mas` on `mas-n8n-postgress-db`.

---

## Key Files

### Chatbot v1
- `prompts/system.md` — system prompt v0.2 (focus + context + synthesis arc, plain-text wrapped USER_PROMPT block as the deliverable)
- `lib/chatbot/system-prompt.ts` — composes overlay + system.md + knowledge files; `SYNTHESIS_DIRECTIVE` appended when `synthesisMode: true`; `parseSynthesis()` extracts `<USER_PROMPT>` block
- `lib/chatbot/openrouter.ts` — OpenRouter wrapper with cache_control passthrough; `maxTokens=2500` for synthesis
- `app/chat/page.tsx` — chat page (cookie-gated)
- `app/chat/ChatWindow.tsx` — client UI with autofocus, message list, completion panel (reveal-prompt + copy-icon + Contact-MAS)
- `app/api/chat/session/start/route.ts` — consent submission
- `app/api/chat/session/exchange/route.ts` — token-for-cookie exchange (Route Handler; Server Components can't set cookies in Next.js 15+)
- `app/api/chat/turn/route.ts` — per-turn handler; at cap-hit runs synthesis and returns `{ reply, prompt_text, completion: true }`
- `middleware.ts` — CORS on `/api/chat/*`
- `docs/wp-chatbot-embed-snippet.html` — drop-in WP Custom HTML widget (Brian pastes into Elementor on `masadvise.org/ai`; substitute `RECAPTCHA_SITE_KEY` placeholder with the real public key)

### Telemetry API (shared with Pattern A scaffolding)
- `app/api/install/register/route.ts` — first-turn consent submission
- `app/api/conversation/turn/route.ts` — per-turn event
- `app/api/conversation/private/route.ts` — conversation-private toggle (pause / resume / forget)
- `lib/db.ts` — pg Pool singleton; exports `SCOPE` constant
- `lib/auth.ts` — `X-API-Key` check
- `lib/schemas.ts` — zod request schemas

### Migrations
- `migrations/000_create_mas_journey_tables.sql` — foundation
- `migrations/001_add_install_consent_columns.sql` — `email`, `share_history`
- `migrations/002_create_mas_ai_advisor_role.sql` — scoped role
- `migrations/003_create_chatbot_tables.sql` — chatbot operational tables

---

## Conventions

- **File naming**: kebab-case for files, PascalCase for classes/types, camelCase for functions/variables.
- **Input validation**: zod-only. Every API handler parses with `safeParse` before touching the DB.
- **Idempotency**: `/register` uses `ON CONFLICT (install_id) DO NOTHING`; `/turn` and `/private` are append-or-delete with no idempotency key.
- **Fail-open on telemetry** — `/turn` and `/private` return `200 { ok: false }` for transient errors so the conversation continues. `/register` returns 5xx because the first-turn submission is worth retrying.
- **Server Components don't set cookies** — Next.js 15+ restriction. Use Route Handlers for token-for-cookie exchanges (see `/api/chat/session/exchange/route.ts`).
- **CORS via `middleware.ts`** — scoped to `/api/chat/*`. Origin allowlist: `www.masadvise.org`, `masadvise.org`, `www.npaiadvisor.com`, `localhost:3000`/`3004` for dev.

---

## Related Projects

- `mas-civicrm-mcp-server` (`~/workspace/development/mas-civicrm-mcp-server/`) — sibling MAS code-over-n8n component (Nina-replacement MCP server).
- `mas-vc-chatbot` (`~/workspace/development/mas-vc-chatbot/`) — separate audience scope; iframe-into-WP pattern was borrowed from there but the runtime is bespoke (this is Next.js, that's n8n).

## Spec Section Mapping

- Goals — spec § Goals
- Chatbot conversation arc — spec § Architecture + Components, plus `prompts/system.md` v0.2
- Synthesis output format — spec § "Cap-hit experience" + `lib/chatbot/system-prompt.ts` `SYNTHESIS_DIRECTIVE`
- Data model — spec § Data Model
- Cap-hit UI — spec § "Decided / locked in" → "Two-button completion UI"
