# mas-ai-advisor — Claude Code Guide

## ⚠️ CRITICAL: Security

**NEVER commit secrets.** API keys and DB credentials live in Azure Key Vault (production) and `.env.local` (development; git-ignored). Use placeholders in `.env.example`.

Reference: @/home/brian/SECURITY.md

---

## Project Overview

**Purpose**: Build pipeline + telemetry API for the public-facing MAS AI Advisor (Pattern A flagship per `mas-embedded-advisor-platform.md` in BrianPKM).

**Status**: Phase 0 scaffold complete. Three API routes wired; system prompt + per-platform adapters land in Phase 1+.

**Working Directory**: `/home/brian/workspace/development/mas-ai-advisor`

**Spec (canonical source of truth)**: `~/gdrive-brianpkm/3-Resources/mas-ai-advisor-spec.md`

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

## Architecture

Code-only telemetry API (no n8n in the install path, per MAS exit-readiness preference).
Postgres tables reused from `mas_journey_*` per BrianPKM `mas-journey-tracking-and-telemetry.md`.

```
Advisor inside user's LLM
  └── per-platform action / MCP tool ──HTTPS──▶ Next.js API ──▶ MAS Postgres
```

Auth: shared API key in `X-API-Key` header, rotated quarterly.
Deployment target: Vercel.

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
