# Case study — Klaus personal AI assistant

**Source value**: `case-study-klaus`
**Pattern**: AI as a thin layer on top of your tools, with persistent memory
**Audience scope**: `mas_public`

## The story

Brian Flett is a technology advisor at MAS whose job is helping Canadian nonprofits adopt AI. That means staying ahead of a field that changes weekly, and showing nonprofit leaders concretely how AI fits *their* work — not someone else's. Generic chatbots fall short for that: every session starts at zero, and work history lives in the vendor's walled garden.

So for the past year Brian has been building and using **Klaus** — a personal AI assistant that knows his work, persists his context, and grows alongside it. It's not a product anyone can buy. It's a pattern — three pillars: persistent memory in a database he owns, connections to the tools his work already lives in, and a firm rule that nothing important is locked inside the AI vendor.

## The discovery — same five steps as the other case studies

1. **Map the actual work** — advising nonprofits, staying current on AI, building outreach tools (workshops, chatbots, case studies) to help leaders imagine how AI fits their organization.
2. **Identify where the field's pace exceeded human capacity** — keeping up with weekly capability shifts, drafting outreach faster than from scratch, retaining lessons across nonprofit conversations.
3. **Prioritize the proactive gaps** — no daily AI-news triage, no persistent memory across sessions, no compounding pattern recognition.
4. **Name the immediate need** — an assistant that could *learn me* over time and surface what I needed to know.
5. **Then, and only then, ask how AI could help.**

Starting with *"let's use AI"* would have built another stateless chatbot. Starting with where the field was outpacing human capacity made the design half-decided already.

## What was built — a thin AI layer on top of existing tools

**Inputs.** Three kinds of source: memory (notes, decisions, prior conversations, all in a Postgres database Brian owns); files (his GitHub repositories, his Obsidian notes, his Google Drive); and tasks (a to-do list, conversation handoffs that carry context across sessions, automated background jobs). None of this is stored inside the AI vendor. It's stored in systems Brian controls. The AI sees what's sent for a given conversation, then forgets. The persistence is in *Brian's* database.

**Processing.** When Brian starts a conversation, Claude reads what's relevant, drafts what's needed, and uses small tools to touch the real systems — read a file, append a task, log a decision, query a database. Some tools run on demand; others run in the background while Brian sleeps — monitoring AI capability shifts, scoring articles, drafting summaries. The conversations themselves are now grounded in very rich context: Klaus already knows the project state, the prior decisions, the open questions. The first ten minutes of "setting context" are gone.

Three operating principles:

- **The AI is the engine, not the database.** Nothing important goes into the AI vendor's memory features.
- **Tools, not free-form access.** Claude calls a small set of named, auditable tools.
- **Working memory, not perfect memory.** Klaus writes down what matters and re-reads it next session.

**Outputs.** Knowledge-base documents (research summaries, enhancement specs, strategy docs); tasks and handoffs (a prioritized list with full context attached, pickable up tomorrow or in three weeks); long memory (every architectural decision, every "we tried that and it didn't work," findable months later).

What Klaus does not output: messages sent on Brian's behalf without review, automatic CRM updates he didn't authorize, anything pretending to be Brian to a third party.

## The real value

After about a year of running Klaus daily:

- **Keeping current.** Daily briefings surface AI capability shifts Brian would otherwise miss. A knowledge base of articles, tools, and talks builds itself in the background, scored against the topics he actually advises nonprofits on. Without Klaus, half a day each week would go to *keeping up*.
- **Building outreach.** More substantive outreach is being produced — webinars, workshops, AI chatbots, public case studies — and each new piece is faster because Klaus carries the context across them.
- **Compounding judgment.** Patterns from one nonprofit conversation surface when prepping for the next. Lessons aren't lost between sessions.

The value isn't that Klaus does the work. It's that Klaus removes the friction between Brian and the work, and surfaces what he'd otherwise miss.

## What it cost

- **Time.** Significant upfront — deciding what to track, what to automate, what *not* to automate. Daily: a few minutes on a briefing, a few minutes wrapping up. Ongoing: architectural changes as the work evolves.
- **Money.** Modest. AI-model usage plus a few cloud-service subscriptions. Built on tools already paid for plus free open source.
- **Maintenance.** Tuning the background jobs. Keeping the documentation honest. Letting the assistant improve itself, with checks.

*The model is the cheap part. The thinking around it is the work.*

## Safety and data privacy

Five principles:

- **My data lives in my systems.** Postgres for memory, Google Drive for files, GitHub for code. The AI vendor doesn't store any of it.
- **Auditable connections.** Every read and write Klaus does is logged.
- **The AI sees only what I send.** Anything sensitive Brian doesn't want shared, doesn't go.
- **No client data without consent.** Same rule as a paper file.
- **Clear AI boundaries.** Klaus drafts; Brian sends. Klaus suggests; Brian decides.

This is fundamentally different from pasting donor data into a public chatbot window. That approach *does* send data to a third party, and often into model training. A well-designed AI assistant doesn't need to.

*Safety by design. Trust by default.*

## Where the pattern generalizes

The underlying pattern — *AI on top of YOUR data, scoped to YOUR role, drafting from YOUR context* — applies broadly:

- A **development director** who briefs herself on a donor in thirty seconds, pulling from the CRM.
- An **executive director** whose meeting notes auto-organize against the strategic plan.
- A **program manager** who drafts the funder report from the year's program data.
- A **communications lead** who drafts grounded in mission and voice.
- An **operations lead** with one place to ask *"what's our policy on…?"* across the document library.

None of this requires replacing existing systems. It requires building a thin layer of AI on top of what's already there.

## What it would take

Building something like this isn't a weekend project, but it's also not a multi-year enterprise software implementation. With the right technical partner, a useful first version can be operational in a few weeks — starting with the area where staff lose the most time to repetitive, information-management work.

The more important question isn't *"can we build this"* — it's *"what would we actually use it for."* The organizations that benefit most are the ones that can articulate where their staff is losing time to work that's important but not high-judgment: summarizing, formatting, retrieving, drafting, organizing.

## What we'd tell another organization considering this

1. **Live it before you teach it.** If you're advising others on AI, build something small for yourself first.
2. **Find the time-sink first.** Not *"where can we use AI?"* but *"where are we losing time on important-but-low-judgment work?"*
3. **Keep your data in your systems.** AI is the engine; your data is yours.
4. **Build for one role first.** A general-purpose assistant for everyone is harder than a focused one for the development director.
5. **Make every AI action reviewable.** Drafts, not sends. Suggestions, not decisions.
6. **Plan to maintain it.** AI assistants drift; knowledge bases go stale; the system improves only if you keep working on it.
