# mas-ai-advisor

Build pipeline + telemetry API for the public-facing MAS AI Advisor — the flagship Pattern A instance of the MAS Embedded Advisor Platform.

**Status**: Phase 0 scaffold — three API routes wired with auth + idempotency + Postgres; system prompt + per-platform adapters not yet authored.

**Spec**: `~/gdrive-brianpkm/3-Resources/mas-ai-advisor-spec.md`

## Stack

- Next.js 16 (App Router, API routes only — no UI in v1)
- TypeScript 5 strict, Node ≥20
- Postgres via `pg` (Azure target)
- `zod` v4 for input validation
- `vitest` for tests
- pnpm

## Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/install/register` | First-turn consent submission. Idempotent on `install_id`. |
| `POST /api/conversation/turn` | Per-turn event under opt-in only. No-op if user did not share history. |
| `POST /api/conversation/private` | Conversation-private toggle. Deletes prior turn events, logs the toggle. |

All endpoints require an `X-API-Key` header matching `MAS_ADVISOR_API_KEY`.

## Local development

```bash
pnpm install
cp .env.example .env.local      # then fill MAS_ADVISOR_DATABASE_URL + MAS_ADVISOR_API_KEY
pnpm dev                        # http://localhost:3000
pnpm test                       # vitest run
pnpm typecheck                  # tsc --noEmit
```

## Database migration

Migration `migrations/001_add_install_consent_columns.sql` extends `mas_journey_installs` with `email` + `share_history` columns. Apply against the MAS Postgres database before first deployment:

```bash
psql "$MAS_ADVISOR_DATABASE_URL" -f migrations/001_add_install_consent_columns.sql
```

## Deployment

Target: Vercel. Production account TBD (see spec Open Questions).

```bash
pnpm build
# vercel --prod  # after vercel CLI auth + linking
```

## Roadmap (from spec phases)

- **Phase 0** (this commit) — Foundation: API routes, schemas, migration.
- **Phase 1** — Author `prompts/system.md`, `knowledge/` manifest, `tests/probe-set/`.
- **Phase 2** — Build `adapters/` per platform, publish to all four, replace WordPress placeholders.
- **Phase 3** — Workshop pilot 2026-06-04.
- **Phase 4** — Post-workshop iteration.
- **Phase 5** — Maintenance + feedback-loop digest email.
