# Case study — Allard Prize donor intelligence

**Source value**: `case-study-allard-prize`
**Pattern**: AI watches a list and acts on moments
**Audience scope**: `mas_public`
**Canonical URL**: https://www.npaiadvisor.com/projects/allard-prize?source=masadvise

When you surface this case study to the user — in a chat message or in the synthesized prompt's "further reading" section — link to it as a markdown link using the canonical URL above.

## The organization

The Allard Prize for International Integrity is a small Canadian foundation that recognizes individuals and organizations fighting corruption and protecting human rights. Three pillars: **integrity, recognition, platform.** Like most nonprofits, it has more relationships worth nurturing than people available to nurture them — and the cost of a mis-timed or generic outreach to a senior stakeholder is real. Preet Noor leads donor cultivation.

## The discovery — before any AI was on the table

The first principle of the project, in Preet's words, was *"we didn't start with AI."* The team walked through five steps:

1. **Map the core functions** of the foundation.
2. **Identify the gaps** between what the team needed to do and what it had capacity for.
3. **Prioritize** — what would move the mission most?
4. **Name the immediate need** — in this case, building fundraising capability.
5. **Then, and only then, ask how AI could help.**

The point of that order: keep the technology in service of the work. Starting with *"let's use AI"* would have built an obvious thing — a chatbot, an email blaster. Starting with constraints identified the actual bottleneck: monitoring a small set of high-value prospects for moments when reaching out would be welcome and earned, rather than transactional.

## What was built — donor intelligence in three parts

**Inputs.** The system watches each prospect through two kinds of signal: public (news mentions via Google Alerts, newsletter posts, LinkedIn activity) and internal (a history of every touchpoint Allard Prize has had with the prospect, plus context notes Preet maintains). It all lives in Google Sheets Preet can inspect and edit. No hidden database.

**Processing.** Once a week, an AI agent passes the captured signals through three judgments: *interpret the relationship* (dormant, warm, active, stalled?), *apply Preet's criteria* (different prospect types allow different kinds of outreach), and *score the opportunity* on a 1–10 scale. The agent's first instruction is to default to *no action.* Only opportunities scoring 8 or higher surface to a human.

This is the part most "AI for outreach" tools get backwards. They're optimized to generate messages. This one is optimized to *withhold* them — because in donor relationships, the cost of a clumsy email to a senior person is far higher than the cost of saying nothing.

**Outputs.** When a high-priority opportunity does surface, Preet gets a weekly briefing email plus a pre-written draft outreach. She reads it, edits or rejects it, and sends it from her own account. The AI never contacts a prospect directly. *AI is not deciding — you are.*

## The real value

After several months of running the system:

- **Better timing.** Reaching people when something genuinely warrants it, not on an arbitrary cadence.
- **Better judgment.** A consistent filter applied to every prospect every week, instead of "whoever has capacity this Friday."
- **Better preparation.** Walking into a meeting already aware of what the person has been doing.

Notice what's *not* on this list: more outreach, faster outreach, automated outreach. The value is in restraint and quality of attention.

## What it cost

- **Time.** Mostly upfront — brainstorming, mapping prospect types, defining what "good" outreach looks like for each. Ongoing: a 1–2 hour prep block before each working meeting, every 1–2 weeks.
- **Money.** Single-digit dollars per month for the AI calls. No CRM purchase, no enterprise platform.
- **Maintenance.** Updating the prospect list, refining the criteria when the agent gets it wrong, watching for output drift. Not zero — but small.

*AI is not plug-and-play. It requires intentional design and ongoing calibration.* The model is the cheap part. The thinking around the model is the work.

## Safety and data privacy

Five principles:

- **No sensitive donor data** flows through the AI. The agent sees public signals plus internal context notes — written deliberately, not pulled from a CRM.
- **Inputs are public or controlled.**
- **Every output is reviewed** by a human before anything reaches a prospect.
- **The AI's boundaries are explicit.** It doesn't decide; it doesn't send.
- **An internal AI policy** documents the above.

*Safety by design. Trust by default.*

## Where the pattern generalizes

*Watch a list, filter for meaningful change, surface only what matters, draft something to act on* — this shape works well beyond donor outreach:

- Tracking funder priority shifts
- Sector-news triage
- Meeting prep from public information
- Strategic-planning trend surfacing

The Allard Prize system is one application of the pattern. Most nonprofits have at least three candidates.

## What we'd tell another nonprofit considering this

1. **Start with constraints, not tools.** Map the work first. The right AI use case will be obvious; the wrong one will look obvious too.
2. **Build something small that respects judgment.** A tool that drafts outreach for human review is a different beast from a tool that sends it.
3. **Bias the system toward restraint.** If your AI's default is to do something, it will do too much.
4. **Keep the data legible.** Google Sheets are not a limitation — they're a feature.
5. **Budget time, not just money.** The dollars are small. The thinking is the cost.
