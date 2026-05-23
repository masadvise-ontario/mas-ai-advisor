# Case study — MAS VC Chatbot

**Source value**: `case-study-vc-chatbot`
**Pattern**: AI as a research partner grounded in your knowledge
**Audience scope**: `mas_public`
**Canonical URL**: https://www.npaiadvisor.com/projects/mas-vc-chatbot?source=masadvise

When you surface this case study to the user — in a chat message or in the synthesized prompt's "further reading" section — link to it as a markdown link using the canonical URL above.

## The organization

Management Advisory Service (MAS) is a Canadian charity that connects about one hundred senior business volunteers — VCs — with small nonprofits that can't afford management consulting. The volunteers donate their time; clients pay a modest administrative fee.

In a charity built on donated time, every minute lost to wrestling with bad tools is a minute *not* spent advising a client. The volunteer consultants were spending real time hunting through CiviCRM, SharePoint, the Resource Library, and masadvise.org for client history, process docs, and policies. New volunteers struggled most — ramp-up was measured in months. And there was a meta-problem: MAS advises nonprofits on adopting AI; doing that credibly meant MAS had to be using AI itself.

## The discovery — same five steps as Allard Prize

1. **Map what a VC actually does** on a typical engagement — intake, client research, deliverables, handoff.
2. **Identify where they lose time** — hunting for case history in CiviCRM, finding the right MAS process doc on SharePoint, looking up policies on the website, asking the same questions in Slack week after week.
3. **Prioritize the painful, low-judgment work** — the lookups, the formatting, the "remind me what we said about X."
4. **Name the immediate need** — give VCs one place to ask, with answers grounded in MAS's own information.
5. **Then, and only then, ask how AI could help.**

AI was not in step 1, 2, or 3. It only entered after the problem was clear.

## What was built — a volunteer consultant assistant

**Inputs.** Three kinds of source: MAS data from CiviCRM (read-only, scoped per VC: each VC sees only their own cases plus unassigned projects); MAS knowledge (SharePoint VC Support Centre, Resource Library, masadvise.org content, Google Drive PDFs); and external nonprofit-AI guidance from sources like ai.ccndr.ca for client-side AI brainstorming.

**Processing.** When a VC types a question, an AI agent picks the right tool for the job: a CRM lookup, a knowledge-base search, a web search of the client's site. It uses each tool, gathers results, and writes a plain-English answer with sources visible. The VC can click through to verify any claim. Three constraints shape the agent:

- **Tools, not free-form access.** The AI doesn't write database queries — it calls a small set of named tools the rules can audit.
- **Scoped data, every time.** The per-VC scope filter is applied before any data leaves CiviCRM, regardless of how the question is phrased.
- **Sources visible.** Every answer cites where it came from. If there's no source, the answer says so.

**Outputs.** A direct cited answer ("what's our intake process?", "who's worked with this client?"); a consolidated client-research brief; or a brainstorming partner for "how should I approach this engagement?" or "what could AI do for this client's work?" What it does *not* output: messages sent on a VC's behalf, edits to MAS records, or recommendations the VC didn't ask for.

## The real value

Observed in early use with a small group of VCs:

- **More advisory hours per donated VC hour.** Less time hunting context, more time on the client's problem.
- **New VCs ramp up in weeks, not months.** The chatbot answers the questions a senior VC used to field over Slack.
- **AI credibility — earned, not claimed.** When MAS advises a nonprofit on adopting AI, it can point to a tool it uses every day.

Notice what's *not* on this list: replacing the VC's judgment, automating client communications, or eliminating MAS staff roles.

## What it cost

- **Time.** Mostly upfront — defining what should and shouldn't be in scope, ingesting and structuring the knowledge base, iterating on what the AI is allowed to do. Ongoing: monitoring feedback and tuning.
- **Money.** Single-digit dollars per VC per month for AI calls. No new enterprise software.
- **Maintenance.** Refreshing the knowledge base when MAS documents change. Tightening the rules when the AI gets something wrong. Watching feedback.

*The model is the cheap part. The work is in the scoping, the data, and the calibration.*

## Safety and data privacy

CRM data — even just contact and case data — is a position of trust. Five principles:

- **Read-only access.** The chatbot cannot modify a single CiviCRM record.
- **Scoped by user.** Each VC only sees what they're permitted to see; the scope is enforced in infrastructure, not just in the AI's prompt.
- **Public or controlled inputs.** The knowledge base is MAS-owned documents and the public MAS website. No sensitive client data in the AI's memory.
- **Review before action.** Drafts and recommendations are starting points for a human; the chatbot doesn't email anyone.
- **Documented AI policy** so trust isn't dependent on any one person remembering it.

*Safety by design. Trust by default.*

## Where the pattern generalizes

*Give a defined audience a single place to ask, grounded in your own data, scoped by who they are.* This shape applies broadly:

- A client-facing chatbot for the public site
- A board portal assistant for member directors
- A donor or member assistant for any nonprofit using CiviCRM
- Onboarding support for new volunteers
- Process search across any document library

Most mid-sized nonprofits have at least three places this pattern would fit.

## What we'd tell another nonprofit considering this

1. **Find the time-sink first.** Don't ask "where can we use AI?" Ask "where are we losing time on work that's important but low-judgment?"
2. **Constrain the data before constraining the AI.** A read-only, per-user-scoped data layer is worth more than any prompt-engineering trick.
3. **Build for one audience first.** A chatbot for everyone is harder to design than one for the thirty volunteers in the portal.
4. **Make the sources visible.** If the AI can't cite where its answer came from, the user shouldn't trust it.
5. **Plan to maintain it.** A chatbot grounded in your knowledge base is only as good as the knowledge base.

*Start narrow. Earn trust. Then widen.*
