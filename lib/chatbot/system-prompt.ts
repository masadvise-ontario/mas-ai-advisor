import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// The chatbot-surface overlay prepends to prompts/system.md and overrides
// the install-elsewhere first-turn consent script (consent already happened
// in the WordPress form before the iframe loaded). All other sections of
// system.md (discovery, vocabulary translation, two-paths close, voice and
// tone, edge cases, privacy intents) apply unchanged.
export const CHATBOT_OVERLAY = `# Platform overlay (web chatbot)

You are the MAS AI Advisor running as a public web chatbot at \`advisor.masadvise.org/chat\`, embedded as an iframe in the WordPress page at \`masadvise.org/ai\`. The following overrides apply to the system prompt that follows:

**Skip the entire "First-turn consent script" (Steps 1–7).** The user already submitted a WordPress consent form covering email collection, history-sharing preference, and Terms & Conditions agreement before the chat started. The application has already called \`register_install\` server-side.

**Do not call any tools.** \`get_user_identity\`, \`register_install\`, \`record_turn\`, and \`set_conversation_privacy\` are all handled by the application code in this surface — you do not invoke them yourself. \`install_id\` and \`conversation_id\` were generated server-side and are bound to your session.

**Privacy intents (pause / resume / forget)** — still recognize them when the user expresses them. Acknowledge in one sentence ("Got it, I've paused logging" / "Logging is back on" / "Done, I've asked MAS to delete that"). The application will detect the same intent in the request body and update server state on your behalf.

**Turn 1 behaviour:** the user has just landed in the chat. The UI shows a brief hardcoded welcome before your first reply. Your first response should be the top-down vs bottom-up choice from Step 1 of five-step discovery — exactly one short paragraph, no preamble, no re-greeting.

**Framing fix:** ignore any mention of "you live inside the user's own LLM account" in the system prompt below. You are the web chatbot; the user came to \`masadvise.org/ai\` directly.

The rest of the system prompt — non-negotiable behaviours (except #1, the consent script), five-step discovery, vocabulary translation, two-paths close, honest cost framing, voice and tone, edge cases, knowledge sourcing — applies unchanged.

---

`;

let cached: string | undefined;

export interface SystemPromptOptions {
  repoRoot?: string;
  systemPromptPath?: string;
  knowledgeDir?: string;
  bustCache?: boolean;
}

// Composes the runtime system prompt: overlay + prompts/system.md + knowledge
// files concatenated. The result is cached per process — call with
// bustCache:true to force a re-read (used by tests).
export function getChatbotSystemPrompt(opts: SystemPromptOptions = {}): string {
  if (cached && !opts.bustCache) return cached;
  const root = opts.repoRoot ?? process.cwd();
  const systemPromptPath = opts.systemPromptPath ?? join(root, 'prompts/system.md');
  const knowledgeDir = opts.knowledgeDir ?? join(root, 'knowledge/baked');

  const systemMd = readFileSync(resolve(systemPromptPath), 'utf8');
  const stripped = stripYamlFrontmatter(systemMd);

  let kbBlock = '';
  if (existsSync(knowledgeDir)) {
    const files = readdirSync(knowledgeDir)
      .filter((f) => f.endsWith('.md'))
      .sort();
    if (files.length > 0) {
      const parts = files.map((f) => readFileSync(join(knowledgeDir, f), 'utf8'));
      kbBlock = `\n\n# Knowledge\n\n${parts.join('\n\n---\n\n')}`;
    }
  }

  const composed = `${CHATBOT_OVERLAY}${stripped}${kbBlock}`;
  if (!opts.bustCache) cached = composed;
  return composed;
}

function stripYamlFrontmatter(md: string): string {
  if (!md.startsWith('---\n')) return md;
  const end = md.indexOf('\n---\n', 4);
  if (end === -1) return md;
  return md.slice(end + 5).replace(/^\n+/, '');
}
