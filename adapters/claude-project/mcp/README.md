# MAS AI Advisor MCP server — Claude Project adapter

Stdio MCP server that the Advisor inside the published MAS Claude Project calls for telemetry. Exposes three tools (`register_install`, `record_turn`, `mark_conversation_private`); each forwards to one Advisor API endpoint.

## Architecture

```
Claude Desktop (or any MCP-aware Claude client)
     │
     │  stdio (JSON-RPC over stdin/stdout)
     │
     ▼
adapters/claude-project/mcp/server.ts   ← runs locally
     │
     │  HTTPS, X-API-Key header
     │
     ▼
MAS Advisor API (Vercel)
```

The server runs on the machine where the Claude client lives — Brian's laptop for testing, or any user's machine if they wire it themselves. The MAS Advisor API key never enters the Claude conversation; it lives in the machine's environment and is added to outbound requests by this server.

## Why stdio (not streamable-HTTP)

See the parent adapter's [`README.md`](../README.md#stdio-mcp-server-not-streamable-http) for the decision rationale and the workshop-visitor implication.

## Install path (Brian's machine)

### 1. Make sure the repo's dependencies are installed

```bash
cd ~/workspace/development/mas-ai-advisor
pnpm install
```

### 2. Set the env vars

The server reads two vars at startup. They are *not* read at file-system level — you can either export them in your shell or pass them through your MCP client's `env` config.

| Var | Required | Default |
|---|---|---|
| `MAS_ADVISOR_API_KEY` | Yes | — |
| `MAS_ADVISOR_API_BASE_URL` | No | `http://localhost:3000` |

For Brian's laptop:

```bash
export MAS_ADVISOR_API_KEY="<same value as the Vercel deployment uses>"
export MAS_ADVISOR_API_BASE_URL="https://<deployed-advisor>.vercel.app"
```

### 3. Smoke-test the server

```bash
pnpm mcp:claude-project
# (no stdout — the server is waiting for JSON-RPC on stdin)
# Ctrl-C to stop.
```

### 4. Wire it into Claude Desktop

Add a section to Claude Desktop's `claude_desktop_config.json` (location varies by OS — see Anthropic's MCP docs):

```json
{
  "mcpServers": {
    "mas-ai-advisor": {
      "command": "pnpm",
      "args": ["--silent", "-C", "/Users/<you>/workspace/development/mas-ai-advisor", "mcp:claude-project"],
      "env": {
        "MAS_ADVISOR_API_KEY": "<key>",
        "MAS_ADVISOR_API_BASE_URL": "https://<deployed-advisor>.vercel.app"
      }
    }
  }
}
```

Restart Claude Desktop. The three tools should appear in the connector picker when you open the published MAS Advisor Project.

### 5. Wire it into the published Claude Project

In claude.ai, open the **MAS AI Advisor** Project (MAS Anthropic workspace), open the connectors / tools panel, and attach the `mas-ai-advisor` MCP server. Confirm the three tools — `register_install`, `record_turn`, `mark_conversation_private` — show up as available to the Advisor.

## Tool contracts

Each tool's input schema is the corresponding zod schema from `lib/schemas.ts` — single source of truth across the API and the MCP server. If the API contract changes, both sides update together.

| Tool | Input shape (zod) | Forwards to |
|---|---|---|
| `register_install` | `registerBodySchema` — `{ install_id, platform, email?, share_history, source? }` | `POST /api/install/register` |
| `record_turn` | `turnBodySchema` — `{ install_id, conversation_id, event_subtype, payload? }` | `POST /api/conversation/turn` |
| `mark_conversation_private` | `privateBodySchema` — `{ install_id, conversation_id }` | `POST /api/conversation/private` |

## Behavioural notes

- **Fail-open on transient errors.** If the API is unreachable, the tool returns a tool-error result instead of throwing. The Advisor's system prompt instructs it to continue the conversation gracefully on telemetry failures.
- **No secret in the model context.** The X-API-Key header is added by this server; the Advisor never sees it.
- **No PII inspection.** The MCP server forwards what it receives. The Advisor's system prompt is responsible for sanitizing `payload` content before calling `record_turn`.

## What this server does NOT do

- It does not implement the consent script. That lives in `prompts/system.md`.
- It does not cache `install_id` or `conversation_id`. The Advisor manages those.
- It does not do any retries. The API layer is idempotent on `install_id`; the Advisor itself decides whether to retry per its system prompt.
- It does not expose live CCNDR retrieval (`kb_retrieve`). That's a follow-on tool for the v2 build pipeline (see manifest.json → `live_retrieval`).
