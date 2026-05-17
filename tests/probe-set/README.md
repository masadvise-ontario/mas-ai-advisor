# Probe-set

Regression coverage for the Advisor's behaviour across platforms. Each probe is a representative user opening + a set of expected properties the response must exhibit.

## What this covers

| Category | Probes | What it asserts |
|---|---|---|
| `consent` | 4 | First-turn consent script is non-skippable, recognizes partial answers, opens the gate when both questions are answered (even both no), and survives a mid-script private-intent interruption (consent completes, then the private toggle is honored) |
| `discovery-pattern-match` | 4 | The Advisor maps user vocabulary to the recognized pattern and surfaces the right case study — Allard Prize, VC Chatbot, Klaus — and names the pattern *without* inventing a case study when none of the three fits |
| `discovery-skip-temptation` | 1 | The Advisor refuses to skip discovery even when the user asks to |
| `restraint` | 1 | Recommends doing less; names all three cost components explicitly (time, money, AND maintenance); offers two paths on a single use case |
| `private-toggle` | 2 | Conversation-private intent is recognized in varied phrasings; the tool is called; user is acknowledged |
| `limits-and-edges` | 2 | The Advisor states the real-data limit and pivots; answers the "are you a real person?" question honestly and offers the engagement path |

## How to run

### Programmatic (Anthropic API)

```bash
pnpm test:probes                            # all probes, Opus 4.7 default
pnpm test:probes --filter=consent           # one category
ADVISOR_MODEL=claude-sonnet-4-6 pnpm test:probes
```

Requires `ANTHROPIC_API_KEY`. The `test:probes` script auto-loads `.env.local` via Node's `--env-file-if-exists` flag, so put the key there (see `.env.example`) rather than exporting it each session. Inline (`ANTHROPIC_API_KEY=... pnpm test:probes`) also works. The runner caches the system prompt (one cache write, ten cheap reads), so a full run is well under $0.20. Results land at `tests/probe-set/results-<timestamp>.json` and are git-ignored.

The runner uses Haiku 4.5 as the LLM judge against each probe's `expects` list. Each judgement returns per-expectation pass/fail plus a short note, so failures point at the specific behaviour that didn't fire.

### Manual loop (claude.ai web)

For interactive role-play discovery — what an automated harness misses. Paste `prompts/system.md` (frontmatter-stripped) into a fresh Claude conversation, then walk each probe in character. The kickoff prompt in `prompts/README.md` bootstraps Claude as the Advisor in a single paste.

## Probe schema

```jsonc
{
  "id": "kebab-case-identifier",
  "category": "consent | discovery-pattern-match | discovery-skip-temptation | restraint | private-toggle | limits-and-edges",
  "setup_turn": "Optional prior-conversation state, in plain English",
  "user_prompt": "What the user says this turn",
  "expects": ["Property 1", "Property 2", "..."]
}
```

## Adding a probe

When the system prompt gets a new behaviour, add a probe that exercises it. Per the spec, every new SOP-like behaviour becomes a regression test — that pattern applies here too.

## Out of scope (v1)

- Programmatic property checks beyond LLM judgement
- Multi-turn probes that simulate a full discovery walkthrough (Phase 4 once we have data on where users actually get stuck)
- Cross-platform consistency assertions (Phase 2)
