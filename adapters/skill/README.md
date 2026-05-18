# `adapters/skill/`

Builds the MAS AI Advisor as an **Agent Skill** bundle per the open standard at [agentskills.io](https://agentskills.io). The Skill bundles the platform-agnostic system prompt + colocated knowledge files into a folder a conformant client can install with `npx skills add` (or platform-native equivalents).

This adapter sits **alongside** the platform-specific adapters (`claude-project/`, `custom-gpt/`, future `gemini-gem/`, future `copilot-agent/`) — not in place of them. The Skill bundle is the canonical payload format per the spec ([locked decision 2026-05-18](../../../gdrive-brianpkm/3-Resources/mas-ai-advisor-spec.md#decided--locked-in)); each platform adapter wraps it in platform-specific publishing metadata.

## Why this exists

- **Cross-platform discoverability** via [skills.sh](https://skills.sh), Vercel's public Skills registry.
- **Conformant clients** install MAS's Skill into their own context: Claude (web + Code), ChatGPT Codex CLI, Microsoft VS Code, Gemini CLI, Cursor, JetBrains, Goose, Sourcegraph Amp, Snowflake, Databricks, Spring AI, and more (full list at agentskills.io).
- **Single source of truth** for the Advisor's behavior. When `prompts/system.md` changes, this adapter regenerates the Skill with the new content; the platform adapters do likewise from the same source.

## Build flow

```bash
pnpm bundle:skill
```

Writes to `build/skill/mas-ai-advisor/`:

```
build/skill/
└── mas-ai-advisor/
    ├── SKILL.md              # YAML frontmatter (name, description, version) + system prompt body
    └── knowledge/
        └── manifest.md       # what the knowledge pack contains
build/skill/bundle.json       # provenance + content hashes
```

## SKILL.md frontmatter

Conforms to the [Agent Skills spec](https://agentskills.io). Required fields:

| Field | Value | Notes |
|---|---|---|
| `name` | `mas-ai-advisor` | lowercase-hyphen identifier |
| `description` | One paragraph: what the Skill does + when to invoke it | Read by conformant clients to decide when to surface the Skill |
| `version` | Inherits from `manifest.json` `version` field | Non-required extension; helps traceability |

The body of SKILL.md is the platform-agnostic system prompt with the original YAML frontmatter stripped (the Advisor's per-source `version: / updated: / purpose:` metadata is folder-level provenance, not Skill-level).

## Publishing to skills.sh

Once the URL migration (custom domain `advisor.masadvise.org`) is complete:

1. `pnpm bundle:skill` → regenerates `build/skill/`
2. Verify `SKILL.md` opens cleanly in any markdown viewer; the frontmatter must be valid YAML with `name` + `description`.
3. Publish per skills.sh docs (registry submission flow — to be documented when MAS makes the first publish).

## What this adapter does NOT do

- It is not an MCP server. The Skill describes the Advisor's behavior; the MCP server at `/api/mcp` provides the tools. Conformant clients that support both Skills and MCP will load them in tandem.
- It does not publish anywhere automatically. The `pnpm bundle:skill` script writes to `build/`; publishing to skills.sh is a separate manual step.

## References

- [Agent Skills open spec](https://agentskills.io) — frontmatter + folder structure.
- [Anthropic engineering: equipping agents with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) — design rationale.
- [skills.sh](https://skills.sh) — Vercel-hosted public Skills registry.
- Spec § "Decided / locked in" → "Payload format → SKILL.md (Agent Skills open standard)".
