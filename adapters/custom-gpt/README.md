# `adapters/custom-gpt/`

Per-platform adapter that packages the platform-agnostic source-of-truth (`prompts/system.md` + `knowledge/`) into a ChatGPT Custom GPT published under Brian's ChatGPT Plus account, and wires the three Advisor tool calls (`register_install`, `record_turn`, `mark_conversation_private`) to the MAS Advisor API via a Custom GPT **Action** defined by an OpenAPI 3.1 schema.

This is the second of four platform adapters (Claude Project landed first in [PR #3](../../../adapters/claude-project/README.md)). The Custom GPT path is named the ChatGPT v1 publishing path in the [spec](../../../gdrive-brianpkm/3-Resources/mas-ai-advisor-spec.md) (§ "Decided / locked in" → "ChatGPT v1 publishing path → Custom GPT").

## What this adapter produces

```
build/custom-gpt/
├── system-prompt.md          # prompts/system.md with the YAML frontmatter stripped
├── knowledge/
│   └── manifest.md           # what content is packaged (case studies, engagement description, CCNDR snapshot)
├── action-schema.json        # OpenAPI 3.1 spec — three operations, ApiKey auth in X-API-Key header
└── bundle.json               # provenance: source hashes, build timestamp, server URL, manifest pointers
```

Brian uploads / pastes these into the Custom GPT Builder at chatgpt.com manually to create or refresh the published Custom GPT (`mas-public-advisor` install scope). The Action calls the deployed Advisor API directly — **no local server, no MCP**. The Custom GPT Builder stores the API key server-side; the Advisor never sees it.

## Build flow

```bash
pnpm bundle:custom-gpt        # tsx adapters/custom-gpt/bundle.ts
                              # → emits build/custom-gpt/
```

`bundle.ts` reads `manifest.json` for the input list, strips the YAML frontmatter from `prompts/system.md`, copies knowledge files, converts the zod schemas in `lib/schemas.ts` to JSON Schema via `z.toJSONSchema()`, assembles the OpenAPI 3.1 document, computes provenance hashes, and writes `build/custom-gpt/`.

### Setting the server URL

The OpenAPI document's `servers[0].url` defaults to `manifest.action.default_server_url` (currently `https://mas-ai-advisor.vercel.app`). Override at bundle time via env:

```bash
MAS_ADVISOR_API_BASE_URL=https://mas-ai-advisor-staging.vercel.app pnpm bundle:custom-gpt
```

The chosen URL is recorded in `build/custom-gpt/bundle.json.action.server_url` so a reviewer can see which environment the bundle targets.

## Publish flow (manual, chatgpt.com UI)

OpenAI does not expose programmatic Custom GPT creation as of this writing, so publishing is a UI flow under Brian's ChatGPT Plus account:

1. Sign in to chatgpt.com as Brian (Plus account).
2. Go to **My GPTs** → **Create**, or open the existing **MAS AI Advisor** Custom GPT for a refresh.
3. Open the **Configure** tab.
4. **Name**: `MAS AI Advisor`. **Description**: short blurb (see [spec § Pattern A flagship](../../../gdrive-brianpkm/3-Resources/mas-ai-advisor-spec.md)).
5. **Instructions**: paste the entire contents of `build/custom-gpt/system-prompt.md`.
6. **Knowledge**: upload every file under `build/custom-gpt/knowledge/`.
7. **Actions** → **Create new action**:
   - **Schema**: paste the entire contents of `build/custom-gpt/action-schema.json`.
   - **Authentication**: set type **API Key**, auth type **Custom**, header name `X-API-Key`, value `<same shared API key the Vercel deployment validates>`. (One-time configuration — the Custom GPT Builder persists it.)
   - **Privacy Policy URL**: `https://masadvise.org/privacy` (or the Advisor-specific privacy page if/when it lands).
8. **Capabilities**: leave Web Browsing **off** for v1 (knowledge is in the uploaded files; live retrieval is deferred). Code Interpreter **off**. DALL·E **off**.
9. **Save** → publish to **Anyone with the link**. Capture the resulting GPT URL.
10. Smoke-test in an incognito session: open the GPT URL, run the first-turn consent script, confirm a row lands in `mas_journey_installs` with `platform = 'chatgpt'`. Verify the Action call shows `X-API-Key` is present (Custom GPT Builder's "Test" panel).
11. Persist the install URL in the repo — `pnpm publish:custom-gpt` will write it to `adapters/custom-gpt/install-url.txt` once an OpenAI publishing API exists; for v1 paste it in by hand.

## How the Advisor talks to the API

The system prompt (`prompts/system.md`) references three symbolic tool names: `register_install`, `record_turn`, `mark_conversation_private`. The per-platform adapter is responsible for wiring those names to a concrete call mechanism. For ChatGPT, that mechanism is **Custom GPT Actions** — the symbolic names become `operationId` fields in the OpenAPI document, which ChatGPT surfaces to the model as callable tools with exactly those names.

| Symbolic name in `system.md` | OpenAPI `operationId` | Method + path | Forwarded to |
|---|---|---|---|
| `register_install` | `register_install` | `POST /api/install/register` | `POST /api/install/register` |
| `record_turn` | `record_turn` | `POST /api/conversation/turn` | `POST /api/conversation/turn` |
| `mark_conversation_private` | `mark_conversation_private` | `POST /api/conversation/private` | `POST /api/conversation/private` |

The Custom GPT Builder injects the `X-API-Key` header on every outbound call from the persisted Action configuration. The Advisor never sees the secret.

## Decisions

These are calls made by this adapter that are not unambiguously specified in the spec. Recorded here so a reviewer can challenge them without re-deriving the reasoning.

### Custom GPT Action, not Workspace Agent

The [spec § "Decided / locked in"](../../../gdrive-brianpkm/3-Resources/mas-ai-advisor-spec.md) locks v1 to Custom GPT because OpenAI has not yet shipped one-click conversion to Workspace Agents and the workshop deadline is 2026-06-04. Re-evaluate when the conversion path lands; see also spec § "Phase 5" → "Monitor OpenAI's Workspace Agents migration timing."

### OpenAPI is generated from `lib/schemas.ts` at bundle time, not hand-authored

`bundle.ts` imports `registerBodySchema`, `turnBodySchema`, `privateBodySchema` from `@/lib/schemas` and runs each through `z.toJSONSchema()` (zod v4) to produce the OpenAPI request-body schemas. Single source of truth for shape validation — if the API contract changes, the OpenAPI doc re-generates on the next `pnpm bundle:custom-gpt`. This mirrors the Claude Project adapter's approach, where the MCP server imports the same zod schemas directly.

### JSON, not YAML, for the OpenAPI document

The Custom GPT Builder accepts both. JSON is what `JSON.stringify(openApi, null, 2)` emits with zero dependencies. YAML is more readable when pasted into the Action editor, but adds a `yaml` dependency for a one-time aesthetic gain. If Brian later prefers YAML, swap the emit step — the structure is identical.

### Bundle is a directory, not a zip

The Custom GPT Builder uploads knowledge files one at a time and accepts the Action schema as pasted text. A directory is easier to inspect, diff, and re-upload partially than a single zip. Mirrors the Claude Project adapter.

### Knowledge files come from `knowledge/manifest.md` only (for now)

Same posture as the Claude Project adapter — `knowledge/manifest.md` declares what *should* be packaged, but the case-study + engagement-description content lives in the shared pgvector KB under audience `mas_public`. The KB pull is a follow-on task (Phase 2 build pipeline). For this PR, `bundle.ts` copies whatever sits in `knowledge/*.md` verbatim and emits a placeholder list of KB sources to be pulled in. The published Custom GPT will have the manifest plus the system prompt, which is sufficient for the discovery method to run; the case studies bake in when the KB pull lands.

### No live retrieval (`kb_retrieve`)

The Claude Project adapter reserves a `kb_retrieve` MCP tool for a future v2 build pipeline that queries the pgvector KB at conversation time. Custom GPT Actions can technically host such an endpoint, but the spec defers live retrieval; for v1 the Custom GPT only knows what it was published with. `manifest.json.knowledge.live_retrieval` records this gap.

### Server URL is bundle-time, not runtime

The OpenAPI `servers[0].url` is fixed when the bundle is produced. If the Vercel deployment URL changes, re-bundle and re-paste the action schema. Justification: Custom GPT Actions don't expose a way for the Builder to overlay a server URL after the schema is set. We accept this rebundle step as the cost of avoiding a redirector service. (Mirrors the spec's "small MAS-side redirector" fallback for the WordPress button strategy — only build redirector machinery if a platform churns.)

### Privacy policy URL is required by OpenAI, set to masadvise.org/privacy

The Custom GPT Builder requires a privacy policy URL when an Action is configured. We point at MAS's general privacy page for v1; an Advisor-specific privacy page is a follow-on if the workshop turns up demand.

## Environment variables

The bundle script reads:

| Var | Purpose | Required |
|---|---|---|
| `MAS_ADVISOR_API_BASE_URL` | Overrides `manifest.action.default_server_url` for the OpenAPI `servers[0].url`. Use the deployed Vercel URL once stable. | No |

The Custom GPT itself (running inside chatgpt.com) reads nothing from env — the API key lives in the Custom GPT Builder's Action configuration; the server URL is baked into the schema; the install / conversation IDs are managed by the Advisor itself per `prompts/system.md`.

## What is NOT in this adapter

- The system prompt itself — lives in `prompts/system.md`, platform-agnostic.
- The knowledge pack source content — lives in `knowledge/` and the shared KB.
- The API implementation — lives in `app/api/...`.
- An MCP server — Custom GPT Actions are the call mechanism here; no local server.
- Per-platform publishing scripts for Copilot / Gemini — each gets its own adapter in this directory tree.
- Vercel env wiring or domain configuration — Brian's domain (deployment is out of scope for this PR).

## References

- Spec § "Components / Modules" → "adapters/custom-gpt/" — purpose, inputs, outputs.
- Spec § "Implementation Plan" → "Phase 2 — Multi-platform publish".
- Spec § "Open Questions" → "Per-platform action mechanism" (ChatGPT row).
- Spec § "Decided / locked in" → "ChatGPT v1 publishing path → Custom GPT".
- `prompts/system.md` — the system prompt this adapter packages.
- `knowledge/manifest.md` — the content manifest this adapter packages.
- `lib/schemas.ts` — zod schemas that drive both the API validation and the OpenAPI request shapes.
- `adapters/claude-project/README.md` — sibling adapter that lands the same source-of-truth on Claude Project (MCP path instead of OpenAPI Action).
