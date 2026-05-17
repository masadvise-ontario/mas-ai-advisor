# `adapters/claude-project/`

Per-platform adapter that packages the platform-agnostic source-of-truth (`prompts/system.md` + `knowledge/`) into a Claude Project published under the MAS Anthropic workspace, and wires the three Advisor tool calls (`register_install`, `record_turn`, `set_conversation_privacy`) to the MAS Advisor API via a small in-repo MCP server.

This is the first of four platform adapters. The Claude Project is the easiest publish path per the [spec](../../../gdrive-brianpkm/3-Resources/mas-ai-advisor-spec.md) (§ "Components / Modules" → "adapters/claude-project/").

## What this adapter produces

```
build/claude-project/
├── system-prompt.md          # prompts/system.md with the YAML frontmatter stripped
├── knowledge/
│   ├── manifest.md           # what content is packaged (case studies, engagement description, CCNDR snapshot)
│   └── (case-study files)    # baked content pulled from the shared KB — TBD, see "Decisions" below
└── bundle.json               # provenance: source hashes, build timestamp, manifest pointers
```

Brian uploads these to claude.ai manually to create / refresh the published Claude Project (`mas-public-advisor` install scope). The MCP server runs locally on Brian's machine (or on any visitor's machine if they choose to wire it themselves) and proxies the three Advisor tool calls to `https://<deployed-api>/api/...`.

## Build flow

```bash
pnpm bundle:claude-project   # tsx adapters/claude-project/bundle.ts
                             # → emits build/claude-project/
```

`bundle.ts` reads `manifest.json` for the list of inputs, strips the YAML frontmatter from `prompts/system.md`, copies the knowledge files, computes provenance hashes, and writes `build/claude-project/`.

## Publish flow (manual, claude.ai UI)

Until the Anthropic Projects API supports programmatic project creation, Brian publishes manually:

1. Sign in to claude.ai under the MAS Anthropic workspace (`info@masadvise.org` — same workspace that hosts the Nina-replacement Advisor).
2. Create or open a Project named **"MAS AI Advisor"**.
3. Paste the contents of `build/claude-project/system-prompt.md` into the Project's system instructions field.
4. Upload every file under `build/claude-project/knowledge/` as Project knowledge files.
5. Save and confirm the project's shareable link works in an incognito session.
6. Add the MAS Advisor MCP server as a custom connector (see `mcp/README.md`).
7. Persist the install URL in the repo — `pnpm publish:claude-project` will write it to `adapters/claude-project/install-url.txt` once the publish API exists; for v1 paste it in by hand.

## How the Advisor talks to the API

The system prompt (`prompts/system.md`) references three symbolic tool names: `register_install`, `record_turn`, `set_conversation_privacy`. The per-platform adapter is responsible for wiring those names to a concrete call mechanism. For Claude, that mechanism is **MCP tools**:

| Symbolic name in `system.md` | MCP tool name | Forwarded to |
|---|---|---|
| `register_install` | `register_install` | `POST /api/install/register` |
| `record_turn` | `record_turn` | `POST /api/conversation/turn` |
| `set_conversation_privacy` | `set_conversation_privacy` | `POST /api/conversation/private` |

The MCP server adds the `X-API-Key` header to every outbound call so the Advisor never sees the secret.

## Decisions

These are calls made by this adapter that are not unambiguously specified in the spec. Recorded here so a reviewer can challenge them without re-deriving the reasoning.

### Stdio MCP server, not streamable-HTTP

The spec calls for "a small MCP server (in-repo) exposing the three API endpoints as MCP tools" and the brief notes the server runs locally on Brian's machine (or wherever the Claude Project is opened). That maps to **stdio**, which is the path Claude Desktop's custom-MCP-server feature accepts. A streamable-HTTP variant is a future enhancement if the workshop validates the need to support web-Claude visitors who don't run Claude Desktop locally.

**Implication for the workshop:** visitors who install the Claude Project from claude.ai web will see the Advisor's character but will not have working telemetry tool calls unless they also wire the MCP server locally. We accept this gap for v1; the consent script's fail-open behaviour (`share_history: false` if the tool is unreachable) means the conversation still works. The probe-set smoke test (`tests/probe-set/`) is the place to verify this gap is documented per-platform.

### Bundle is a directory, not a zip

claude.ai requires manual upload via the UI. A directory is easier to inspect, diff, and partially re-upload (one file at a time) than a single zip. Brian can drag-and-drop the directory contents into the Project knowledge UI.

### MCP server shares zod schemas with the API routes

The MCP server imports `registerBodySchema`, `turnBodySchema`, `privateBodySchema` from `@/lib/schemas`. Single source of truth for shape validation; if the API contract changes, both sides update together.

### Knowledge files come from `knowledge/manifest.md` only (for now)

`knowledge/manifest.md` declares what *should* be packaged, but the case-study + engagement-description content lives in the shared pgvector KB under audience `mas_public`. The KB pull is a follow-on task (Phase 2 build pipeline). For this PR, `bundle.ts` copies whatever sits in `knowledge/*.md` verbatim and emits a placeholder list of KB sources to be pulled in. The published Claude Project will have the manifest plus the system prompt, which is sufficient for the discovery method to run; the case studies bake in when the KB pull lands.

### MCP server is `tsx`-run, not compiled

Brian runs it locally via `pnpm mcp:claude-project` (which calls `tsx adapters/claude-project/mcp/server.ts`). No build step, no dist directory. If the server ever needs to be distributed via `npx`, the move to a compiled package is a separate task.

## Environment variables

The MCP server reads:

| Var | Purpose | Required |
|---|---|---|
| `MAS_ADVISOR_API_KEY` | Shared API key (same value as the Vercel deployment uses). Sent as `X-API-Key` to every API call. | Yes |
| `MAS_ADVISOR_API_BASE_URL` | Base URL for the deployed MAS Advisor API. Defaults to `http://localhost:3000` for local development. | No |

The bundle build script reads nothing from env — it's a pure file-system transform.

## What is NOT in this adapter

- The system prompt itself — lives in `prompts/system.md`, platform-agnostic.
- The knowledge pack source content — lives in `knowledge/` and the shared KB.
- The API implementation — lives in `app/api/...`.
- Per-platform publishing scripts for ChatGPT / Copilot / Gemini — each gets its own adapter in this directory tree.
- Vercel env wiring or domain configuration — Brian's domain (deployment is out of scope for this PR).

## References

- Spec § "Components / Modules" → "adapters/claude-project/" — purpose, inputs, outputs.
- Spec § "Implementation Plan" → "Phase 2 — Multi-platform publish".
- `prompts/system.md` — the system prompt this adapter packages.
- `knowledge/manifest.md` — the content manifest this adapter packages.
- `mcp/README.md` — install path for the MCP server on Brian's machine.
