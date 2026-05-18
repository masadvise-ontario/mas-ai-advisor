# `adapters/claude-project/`

Per-platform adapter that packages the platform-agnostic source-of-truth (`prompts/system.md` + `knowledge/`) into a Claude Project published under the MAS Anthropic workspace. The Project attaches the MAS Advisor's streamable-HTTP MCP endpoint as a custom connector to wire the three Advisor tool calls (`register_install`, `record_turn`, `set_conversation_privacy`).

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

Brian uploads these to claude.ai manually to create / refresh the published Claude Project (`mas-public-advisor` install scope). The MCP endpoint that backs the three tool calls is served by the same Next.js app as the Advisor API — see [MCP transport](#mcp-transport) below.

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
6. Add the MAS Advisor MCP server as a custom connector. URL: `https://<deployed-advisor>/api/mcp`. Auth: see [MCP transport](#mcp-transport) for the current auth mode.
7. Persist the install URL in the repo — `pnpm publish:claude-project` will write it to `adapters/claude-project/install-url.txt` once the publish API exists; for v1 paste it in by hand.

## MCP transport

**Streamable-HTTP** (the current MCP spec's preferred transport), served by the Next.js app at `/api/mcp`. Same Vercel deployment as the API routes. Stateless (no session ID — each tool call is a self-contained JSON-RPC request).

| Symbolic name in `system.md` | MCP tool name | Forwarded to handler |
|---|---|---|
| `get_user_identity` | `get_user_identity` | Reads `authInfo.extra.email` from the OAuth JWT; no DB hit |
| `register_install` | `register_install` | `lib/handlers/register-install.ts` → `POST /api/install/register` parity (with OAuth-email fallback) |
| `record_turn` | `record_turn` | `lib/handlers/record-turn.ts` → `POST /api/conversation/turn` parity |
| `set_conversation_privacy` | `set_conversation_privacy` | `lib/handlers/set-conversation-privacy.ts` → `POST /api/conversation/private` parity |

The MCP route handler verifies the OAuth bearer JWT, then dispatches to the SDK's `WebStandardStreamableHTTPServerTransport` with the verified claims attached as `authInfo`. Tool handlers read the OAuth email from `extra.authInfo.extra.email`.

### Auth: OAuth 2.1 (PR #13)

The MAS Advisor is both **resource server** (the MCP endpoint at `/api/mcp`) and **authorization server** (the in-repo OAuth provider). Auth.js (NextAuth v5) handles the user-facing "Sign in with Google / GitHub" login; the OAuth provider layer wraps the Auth.js session into RFC-compliant OAuth endpoints.

Endpoints exposed:

- `/.well-known/oauth-authorization-server` — RFC 8414 authorization-server metadata
- `/.well-known/oauth-protected-resource` — RFC 9728 protected-resource metadata
- `/.well-known/jwks.json` — public signing key for token verification
- `/oauth/register` — Dynamic Client Registration per RFC 7591
- `/oauth/authorize` — authorization endpoint with PKCE (S256-only) and RFC 8707 resource indicators
- `/oauth/token` — token endpoint (authorization_code grant; public client + PKCE)

Tokens are RS256-signed JWTs with 15-minute TTL. claims include `sub`, `email`, `email_verified`, `client_id`, `scope`, `aud=<mcp resource URI>`, `iss=<issuer>`.

The unauthenticated 401 from `/api/mcp` includes a `WWW-Authenticate: Bearer realm=..., resource_metadata=<url>` header (RFC 9728), so claude.ai's connector can self-bootstrap the discovery flow.

### Why not stdio

The original v1 adapter (PR #3, deprecated 2026-05-17) wired the MCP server as stdio for Claude Desktop. That doesn't work for claude.ai web — its custom-connector mechanism only accepts remote HTTPS endpoints and will not invoke local processes. Workshop visitors also won't install local tooling. Streamable-HTTP is the only transport that serves both surfaces. (Recorded in spec under the "MCP transport + authorization" locked decision.)

## Decisions

These are calls made by this adapter that are not unambiguously specified in the spec. Recorded here so a reviewer can challenge them without re-deriving the reasoning.

### Bundle is a directory, not a zip

claude.ai requires manual upload via the UI. A directory is easier to inspect, diff, and partially re-upload (one file at a time) than a single zip. Brian can drag-and-drop the directory contents into the Project knowledge UI.

### MCP server shares zod schemas with the API handlers

The MCP route imports `registerBodySchema`, `turnBodySchema`, `privateBodySchema` from `@/lib/schemas` and delegates to the same `lib/handlers/*` functions the REST routes use. Single source of truth for shape validation and business logic; if the API contract changes, both sides update together.

### Knowledge files come from `knowledge/manifest.md` only (for now)

`knowledge/manifest.md` declares what *should* be packaged, but the case-study + engagement-description content lives in the shared pgvector KB under audience `mas_public`. The KB pull is a follow-on task (Phase 2 build pipeline). For this PR, `bundle.ts` copies whatever sits in `knowledge/*.md` verbatim and emits a placeholder list of KB sources to be pulled in. The published Claude Project will have the manifest plus the system prompt, which is sufficient for the discovery method to run; the case studies bake in when the KB pull lands.

### Stateless MCP transport, no session ID

The MCP `WebStandardStreamableHTTPServerTransport` is constructed with `sessionIdGenerator: undefined`. Reasons: Vercel serverless instances don't share memory across cold starts, the Advisor doesn't need session continuity for these three tools, and stateless mode avoids the "session not found" failure mode when a request lands on a different Lambda from the initialization request.

## Environment variables

The MCP route + OAuth provider layer (in the Next.js app) read:

| Var | Purpose | Required |
|---|---|---|
| `MAS_ADVISOR_DATABASE_URL` | Postgres connection. Used by handlers + OAuth client/code tables. | Yes |
| `MAS_ADVISOR_API_KEY` | Legacy `X-API-Key` for the REST routes (Custom GPT, Copilot, Gemini click-out). Not used by `/api/mcp` anymore. | Yes (REST adapters) |
| `MAS_ADVISOR_OAUTH_ISSUER` | Public base URL of the Advisor — used as JWT `iss` claim and in `.well-known/*` metadata. | Yes |
| `MAS_ADVISOR_OAUTH_JWT_PRIVATE_KEY` | RS256 private key (base64 PEM). Signs access tokens. Rotate annually. | Yes |
| `MAS_ADVISOR_OAUTH_JWT_PUBLIC_KEY` | RS256 public key (base64 PEM). Published at `/.well-known/jwks.json`; verifies access tokens. | Yes |
| `AUTH_SECRET` | Auth.js session JWT secret. | Yes |
| `AUTH_URL` | Auth.js base URL (auto-detected on Vercel). | Local dev only |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client for the user-facing sign-in. | Yes |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth client for the user-facing sign-in. | Yes |
| `AUTH_MICROSOFT_ENTRA_ID_ID` / `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Microsoft Entra ID app for M365 / personal Microsoft sign-in. | Yes |
| `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID` | Microsoft tenant scope. `common` for any-tenant + personal; specific tenant GUID for org-only. | Default `common` |

The bundle build script reads nothing from env — it's a pure file-system transform.

## What is NOT in this adapter

- The system prompt itself — lives in `prompts/system.md`, platform-agnostic.
- The knowledge pack source content — lives in `knowledge/` and the shared KB.
- The API and MCP route implementations — live in `app/api/...` and `lib/handlers/...`.
- Per-platform publishing scripts for ChatGPT / Copilot / Gemini — each gets its own adapter in this directory tree.
- Vercel env wiring or domain configuration — out of scope for this PR; tracked in spec "Open questions".

## References

- Spec § "Components / Modules" → "adapters/claude-project/" — purpose, inputs, outputs.
- Spec § "Decided / locked in" → "MCP transport + authorization" — transport + auth choice.
- Spec § "Implementation Plan" → "Phase 2 — Multi-platform publish".
- `prompts/system.md` — the system prompt this adapter packages.
- `knowledge/manifest.md` — the content manifest this adapter packages.
- `app/api/mcp/route.ts` — the streamable-HTTP MCP route this adapter targets.
