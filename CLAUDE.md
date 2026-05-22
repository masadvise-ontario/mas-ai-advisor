# mas-ai-advisor — Claude Code Guide

## ⚠️ CRITICAL: Security

**NEVER commit secrets.** API keys and DB credentials live in Azure Key Vault (production) and `.env.local` (development; git-ignored). Use placeholders in `.env.example`.

Reference: @/home/brian/SECURITY.md

---

## Project Overview

**Purpose**: Web chatbot + telemetry API for the public-facing MAS AI Advisor. The chatbot at `advisor.masadvise.org/chat` (iframed into `masadvise.org/ai`) is the single v1 surface — calls Anthropic via OpenRouter (BYOK on MAS's account).

**Status (2026-05-22)**:
- Phase 0 (telemetry API + schemas + migrations) ✅ on main.
- Phase 1 (system prompt v0 + knowledge manifest + probe-set) ✅ on `claude/mas-ai-advisor-phase-1`.
- Phase 2 chatbot build (per `mas-ai-chatbot-build-plan.md`) — active. See `claude/chatbot-v1` branch when it lands.
- **Pattern A install-elsewhere on hold** — Claude Project MCP + OAuth (PRs #12-18), SKILL.md bundle (PR #18), Custom GPT bundle script (PR #6) all shipped to repo but NOT exercised in v1. Do not publish to ChatGPT / Copilot / Gemini / Claude Project platforms without an explicit resume decision. Revisit post-workshop.

**Working Directory**: `/home/brian/workspace/development/mas-ai-advisor`

**Spec (canonical source of truth)**: `~/gdrive-brianpkm/3-Resources/mas-ai-advisor-spec.md`
**Chatbot build plan**: `~/gdrive-brianpkm/3-Resources/mas-ai-chatbot-build-plan.md`

**Cap-hit CTA**: single button → `masadvise.org/contact-us` (engage MAS). Don't add install-elsewhere or donate buttons to the cap-hit panel — decided 2026-05-22.

---

## Tech Stack

- TypeScript 5 strict, Node ≥20
- Next.js 16 (App Router, API routes only — no UI in v1)
- Postgres via `pg` (Azure target)
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
            └── iframe /chat → exchange token for cookie
                 └── POST /api/chat/turn ──▶ OpenRouter (Haiku 4.5, cache_control) ──▶ MAS Postgres
```

Cap-hit experience: single CTA → `masadvise.org/contact-us`.

**Dormant (Pattern A on hold)**: streamable-HTTP MCP server at `/api/mcp` + OAuth 2.1 provider layer in repo for the Claude Project adapter; not exercised in v1.

Auth: shared API key in `X-API-Key` header, rotated quarterly (for telemetry endpoints; the chatbot session uses HMAC-signed session tokens + HttpOnly cookies).
Deployment target: Vercel. DB role `mas_ai_advisor` against `mas` on `mas-n8n-postgress-db`.

---

## Key Files

- `app/api/install/register/route.ts` — first-turn consent submission
- `app/api/conversation/turn/route.ts` — per-turn event (only if share_history)
- `app/api/conversation/private/route.ts` — conversation-private toggle
- `lib/db.ts` — pg Pool singleton; exports `SCOPE` constant
- `lib/auth.ts` — `X-API-Key` check
- `lib/schemas.ts` — zod request schemas (single source for shape validation)
- `__tests__/schemas.test.ts` — schema regression coverage
- `migrations/001_add_install_consent_columns.sql` — DDL for `mas_journey_installs`

---

## Conventions

- **File naming**: kebab-case for files, PascalCase for classes/types, camelCase for functions/variables.
- **Input validation**: zod-only. Every API handler parses with `safeParse` before touching the DB.
- **Idempotency**: `/register` uses `ON CONFLICT (install_id) DO NOTHING`; `/turn` and `/private` are append-or-delete with no idempotency key.
- **Fail-open on `/turn` and `/private`** — return `200 { ok: false }` for transient errors so the Advisor's conversation continues. `/register` returns 5xx because the first-turn submission is worth retrying.
- **Scope is a constant** (`SCOPE = 'mas-public-advisor'` in `lib/db.ts`); never accept it from request bodies.

---

## Related Projects

- `mas-civicrm-mcp-server` (`~/workspace/development/mas-civicrm-mcp-server/`) — sibling MAS code-over-n8n component (Nina-replacement MCP server).
- `mas-vc-chatbot` (`~/workspace/development/mas-vc-chatbot/`) — Pattern B reference instance, separate audience scope.

## Spec Section Mapping

- Goals — spec § Goals
- API endpoints — spec § Components / Modules → MAS Advisor API
- Data model — spec § Data Model
- Implementation plan — spec § Implementation Plan
