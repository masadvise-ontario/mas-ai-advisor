import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Slim chatbot overlay. The base prompt (prompts/system.md v0.2+) is already
// chatbot-centric — short discovery, context gathering, synthesis as the
// deliverable. The overlay just locks down a few surface-specific guardrails.
export const CHATBOT_OVERLAY = `# Platform overlay (web chatbot)

You are running as the public web chatbot at \`advisor.masadvise.org/chat\`, embedded as an iframe in the WordPress page at \`masadvise.org/ai\`.

**Surface guardrails (apply on every turn):**

- The user already gave consent via a WordPress form before the chat loaded. The application has already recorded \`install_id\`, \`conversation_id\`, and consent state server-side. **Do not run a consent script. Do not ask for email or history-sharing consent.**
- The UI shows a hardcoded welcome before your first reply ("Hi — I'm the MAS AI Advisor. I help you figure out where AI can help your nonprofit most, then I produce a prompt you can paste into ChatGPT, Claude, or whatever AI you use to keep going."). The user has already seen it. **Do not re-introduce yourself. Do not re-welcome.** Go straight into substance.
- **Do not call any tools.** \`get_user_identity\`, \`register_install\`, \`record_turn\`, and \`set_conversation_privacy\` are all handled by application code on this surface.
- Privacy intents (pause / resume / forget): acknowledge in one sentence, then continue. The application handles the actual telemetry update.

The rest of your behaviour — the short-discovery + context-gathering + synthesis arc, vocabulary translation, voice, what-you-do-not-do, when-AI-isn't-the-answer — is defined in the base prompt below.

---

`;

// Injected as a suffix when the application wants the LLM to produce the
// final synthesis (typically at turn-cap). Kept short and emphatic so it
// dominates the LLM's next reply.
export const SYNTHESIS_DIRECTIVE = `

---

# SYNTHESIZE NOW

The conversation has reached its budget. Produce the synthesis per the **Synthesis** section of the base prompt:

1. A short summary (3-5 sentences of warm prose — focus area, context the user shared, what the prompt below will help them do next, MAS-as-human-help nudge).
2. The custom prompt wrapped in \`<USER_PROMPT>\` … \`</USER_PROMPT>\` tags.

Do not ask any further questions. Do not extend the conversation. Produce both sections in one reply, in order.
`;

let cached: string | undefined;

export interface SystemPromptOptions {
  repoRoot?: string;
  systemPromptPath?: string;
  knowledgeDir?: string;
  bustCache?: boolean;
  synthesisMode?: boolean;
}

// Composes the runtime system prompt: overlay + prompts/system.md + knowledge
// files concatenated. The result is cached per process — call with
// bustCache:true to force a re-read (used by tests). The synthesisMode flag
// is NOT cached because it varies per request.
export function getChatbotSystemPrompt(opts: SystemPromptOptions = {}): string {
  const base = getCachedBase(opts);
  if (opts.synthesisMode) {
    return base + SYNTHESIS_DIRECTIVE;
  }
  return base;
}

function getCachedBase(opts: SystemPromptOptions): string {
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

// Parses a USER_PROMPT block out of the synthesis reply. Returns the prompt
// text (without the wrapper tags) and the surrounding summary text (with the
// USER_PROMPT block stripped). If no block is found, prompt_text is null.
export function parseSynthesis(reply: string): { summary: string; prompt: string | null } {
  const match = reply.match(/<USER_PROMPT>([\s\S]*?)<\/USER_PROMPT>/);
  if (!match) {
    return { summary: reply.trim(), prompt: null };
  }
  const prompt = match[1].trim();
  const summary = (reply.slice(0, match.index) + reply.slice(match.index! + match[0].length))
    .replace(/```\s*$/, '')
    .replace(/\n```\s*$/, '')
    .trim();
  return { summary, prompt };
}
