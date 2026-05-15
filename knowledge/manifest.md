# Knowledge Pack Manifest

Declares what content the build pipeline composes into each platform artifact. Audience scope is `mas_public` per `mas-knowledge-base-architecture.md`.

The Advisor's system prompt is platform-agnostic (`prompts/system.md`). The knowledge pack is platform-agnostic at the source level; per-platform adapters (Phase 2) decide how to package it given each platform's knowledge model and file ceiling.

## Audience scope

`mas_public` — the shared pgvector KB filter applied at build time. The Advisor never sees `mas_vc`, `mas_ops`, or any `client_*_*` scope.

## Baked-in content

Packaged into each platform artifact at build time. Small, slow-changing, worth duplicating across publishes.

### Case studies

Each case study is a single document in the shared KB. The build pipeline pulls the latest version at build time.

| Case study | Pattern it teaches | KB source value |
|---|---|---|
| Allard Prize | AI watches a list and acts on moments | `case-study-allard-prize` |
| MAS VC Chatbot | AI as a research partner grounded in your knowledge | `case-study-vc-chatbot` |
| Klaus | AI as a thin layer on top of your tools, with persistent memory | `case-study-klaus` |

Future case studies are added when an engagement passes the publication readiness gate (`mas-ai-landing-page.md`). Adding one is a manifest edit + a rebuild — no code change.

### MAS engagement description

What a MAS AI build looks like — pro bono with an invited donation, weeks not months, scoped use cases, two-paths framing.

| KB source value |
|---|
| `engagement-description` |

## Live retrieval

Called as a tool by the Advisor at conversation time. Used for content that is large or refreshes faster than the publish cadence.

### CCNDR — Canadian Centre for Nonprofit Digital Resilience

Periodic scrape of `ai.ccndr.ca` into the shared KB under audience `mas_public`. Refresh cadence owned by the ingestion workflow.

| KB source value | Endpoint (Phase 2) |
|---|---|
| `ccndr-ai` | `POST /api/kb/retrieve` (TBD) — passes `kb_id: "mas_public"` to `kb-retrieval-sub` (`eLwfr4GbXtM1gCmJ`) |

**Per-platform availability:**
- ChatGPT Custom GPT → Custom GPT Action (OpenAPI 3.1)
- Microsoft Copilot Agent → Power Platform / M365 connector (Phase 2 verify)
- Google Gemini Gem → **no native action support; falls back to the baked-in CCNDR snapshot at build time** (documented gap; see spec Open Questions)
- Claude Project → MCP tool exposed by the in-repo MCP server

## Per-platform packaging

| Platform | Bakes in | Live retrieval |
|---|---|---|
| ChatGPT Custom GPT | Case studies + engagement description | CCNDR via Custom GPT Action |
| Copilot Agent | Case studies + engagement description | CCNDR via Power Platform connector (Phase 2 verify) |
| Gemini Gem | Case studies + engagement description + baked-in CCNDR snapshot (must fit ~10 file ceiling) | None |
| Claude Project | Case studies + engagement description | CCNDR via MCP tool |

## Refresh policy

- **Case studies** — rebake when a new case study clears the publication readiness gate, or when an existing case study is materially edited in BrianPKM
- **Engagement description** — rebake on edit (low frequency)
- **CCNDR** — live retrieval where platform supports it; baked snapshot for Gemini, refreshed on each `pnpm build`
- **All platforms** — `pnpm build && pnpm publish-all` re-emits from the same source

## Build pipeline integration (Phase 2)

`pnpm build` will:

1. Read this manifest
2. Pull baked content from the shared KB (filter by `kb_ids @> ARRAY['mas_public']::text[]` + `source` in the list above)
3. Emit per-platform artifacts under `build/out/<platform>/`
4. Stage the artifacts for `pnpm publish-<platform>` to upload

Manifest is the source of truth; the build pipeline is data-driven. Adding a content type is a manifest edit, not a code edit.

## Out of scope (v1)

- Sector-specialized variants (Foundations Advisor, Service-Delivery Advisor) — deferred until post Phase 4
- Per-client public advisor scopes — hypothetical until a client engagement requests one
- Community-contributed patterns from `nonprofit-ai-collaboration-repo` — future, requires source attribution UX
