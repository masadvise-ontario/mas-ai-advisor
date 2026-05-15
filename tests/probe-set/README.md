# Probe-set

Regression coverage for the Advisor's behaviour across platforms. Each probe is a representative user opening + a set of expected properties the response must exhibit.

## What this covers

| Category | Probes | What it asserts |
|---|---|---|
| `consent` | 3 | First-turn consent script is non-skippable, recognizes partial answers, opens the gate when both questions are answered (even both no) |
| `discovery-pattern-match` | 3 | The Advisor maps user vocabulary to the recognized pattern and surfaces the right case study — Allard Prize, VC Chatbot, Klaus |
| `discovery-skip-temptation` | 1 | The Advisor refuses to skip discovery even when the user asks to |
| `restraint` | 1 | Recommends doing less, names the cost framing, offers two paths on a single use case |
| `private-toggle` | 2 | Conversation-private intent is recognized in varied phrasings; the tool is called; user is acknowledged |

## How to run (Phase 2)

Each probe is run against each published platform artifact. Responses are LLM-judged against the `expects` list for first release; tightened to programmatic checks later if cheap regression coverage is needed.

The smoke-test runner lives in `tests/probe-set/run.ts` (not yet implemented — Phase 2 task).

Manual loop for Phase 1 — paste `prompts/system.md` (frontmatter-stripped) into a fresh Claude conversation as the system prompt, then play each probe through it. Pass = response meets every `expects` bullet.

## Probe schema

```jsonc
{
  "id": "kebab-case-identifier",
  "category": "consent | discovery-pattern-match | discovery-skip-temptation | restraint | private-toggle",
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
