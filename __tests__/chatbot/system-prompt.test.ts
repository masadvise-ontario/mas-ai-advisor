import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CHATBOT_OVERLAY,
  SYNTHESIS_DIRECTIVE,
  getChatbotSystemPrompt,
  parseSynthesis,
} from '@/lib/chatbot/system-prompt';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'chatbot-sysprompt-'));
  mkdirSync(join(root, 'prompts'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('getChatbotSystemPrompt', () => {
  it('prepends the overlay and strips YAML frontmatter from system.md', () => {
    writeFileSync(
      join(root, 'prompts/system.md'),
      '---\nversion: 0.2\n---\n\n# Advisor body\n\nDo the discovery.',
    );
    const prompt = getChatbotSystemPrompt({ repoRoot: root, bustCache: true });
    expect(prompt.startsWith(CHATBOT_OVERLAY)).toBe(true);
    expect(prompt).toContain('# Advisor body');
    expect(prompt).not.toContain('version: 0.2');
  });

  it('appends knowledge files when knowledge/baked has .md files', () => {
    writeFileSync(join(root, 'prompts/system.md'), '# Body\n');
    mkdirSync(join(root, 'knowledge/baked'), { recursive: true });
    writeFileSync(join(root, 'knowledge/baked/01-allard.md'), '# Allard Prize\nList watcher.');
    writeFileSync(join(root, 'knowledge/baked/02-klaus.md'), '# Klaus\nThin layer.');
    const prompt = getChatbotSystemPrompt({ repoRoot: root, bustCache: true });
    expect(prompt).toContain('# Knowledge');
    expect(prompt).toContain('# Allard Prize');
    expect(prompt).toContain('# Klaus');
  });

  it('omits the Knowledge section when no baked files exist', () => {
    writeFileSync(join(root, 'prompts/system.md'), '# Body\n');
    const prompt = getChatbotSystemPrompt({ repoRoot: root, bustCache: true });
    expect(prompt).not.toContain('# Knowledge');
  });

  it('sorts knowledge files by name for deterministic ordering', () => {
    writeFileSync(join(root, 'prompts/system.md'), '# Body\n');
    mkdirSync(join(root, 'knowledge/baked'), { recursive: true });
    writeFileSync(join(root, 'knowledge/baked/02-second.md'), 'second');
    writeFileSync(join(root, 'knowledge/baked/01-first.md'), 'first');
    const prompt = getChatbotSystemPrompt({ repoRoot: root, bustCache: true });
    const firstIdx = prompt.indexOf('first');
    const secondIdx = prompt.indexOf('second');
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(firstIdx);
  });

  it('appends the SYNTHESIS_DIRECTIVE when synthesisMode is true', () => {
    writeFileSync(join(root, 'prompts/system.md'), '# Body\n');
    const normal = getChatbotSystemPrompt({ repoRoot: root, bustCache: true });
    const synth = getChatbotSystemPrompt({ repoRoot: root, bustCache: true, synthesisMode: true });
    expect(normal).not.toContain('SYNTHESIZE NOW');
    expect(synth.endsWith(SYNTHESIS_DIRECTIVE)).toBe(true);
    expect(synth).toContain('SYNTHESIZE NOW');
    expect(synth).toContain('<USER_PROMPT>');
  });
});

describe('CHATBOT_OVERLAY content', () => {
  it('locks the consent-script guardrail', () => {
    expect(CHATBOT_OVERLAY).toMatch(/Do not run a consent script/i);
    expect(CHATBOT_OVERLAY).toMatch(/Do not ask for email or history-sharing consent/i);
  });

  it('locks the no-re-welcome guardrail', () => {
    expect(CHATBOT_OVERLAY).toMatch(/Do not re-introduce yourself/i);
    expect(CHATBOT_OVERLAY).toMatch(/Do not re-welcome/i);
  });

  it('locks the no-tools guardrail', () => {
    expect(CHATBOT_OVERLAY).toMatch(/Do not call any tools/i);
    expect(CHATBOT_OVERLAY).toContain('register_install');
    expect(CHATBOT_OVERLAY).toContain('get_user_identity');
  });
});

describe('parseSynthesis', () => {
  it('extracts a USER_PROMPT block and returns the surrounding summary', () => {
    const reply = `Here's the summary of what we discussed.

<USER_PROMPT>
You are helping me, the ED of Acme Nonprofit.
Help me draft a list.
</USER_PROMPT>`;
    const { summary, prompt } = parseSynthesis(reply);
    expect(summary).toBe("Here's the summary of what we discussed.");
    expect(prompt).toContain('You are helping me');
    expect(prompt).toContain('Help me draft a list.');
  });

  it('returns the full reply as summary when no USER_PROMPT block is present', () => {
    const reply = 'Just a summary, no prompt block.';
    const { summary, prompt } = parseSynthesis(reply);
    expect(summary).toBe('Just a summary, no prompt block.');
    expect(prompt).toBeNull();
  });

  it('handles markdown code fences around the USER_PROMPT block', () => {
    const reply = `Summary here.

\`\`\`
<USER_PROMPT>
Prompt body.
</USER_PROMPT>
\`\`\``;
    const { summary, prompt } = parseSynthesis(reply);
    expect(prompt).toBe('Prompt body.');
    expect(summary.startsWith('Summary here.')).toBe(true);
  });

  it('strips the prompt block out of the summary cleanly', () => {
    const reply = `Before.

<USER_PROMPT>
the prompt
</USER_PROMPT>

After.`;
    const { summary, prompt } = parseSynthesis(reply);
    expect(prompt).toBe('the prompt');
    expect(summary).toContain('Before.');
    expect(summary).toContain('After.');
    expect(summary).not.toContain('USER_PROMPT');
  });

  it('strips leftover code fences when the LLM wraps the USER_PROMPT block in triple-backticks', () => {
    const reply = `Here's the summary.

\`\`\`
<USER_PROMPT>
the prompt body
</USER_PROMPT>
\`\`\`

How to use it: paste away.`;
    const { summary, prompt } = parseSynthesis(reply);
    expect(prompt).toBe('the prompt body');
    expect(summary).toContain("Here's the summary.");
    expect(summary).toContain('How to use it');
    expect(summary).not.toContain('```');
  });

  it('strips fences inside the USER_PROMPT content if the LLM nested them', () => {
    const reply = `Summary.

<USER_PROMPT>
\`\`\`
actual prompt body
\`\`\`
</USER_PROMPT>`;
    const { prompt } = parseSynthesis(reply);
    expect(prompt).toBe('actual prompt body');
    expect(prompt).not.toContain('```');
  });

  it('strips fences from the summary even when no USER_PROMPT block is present', () => {
    const reply = `\`\`\`\nfree text\n\`\`\``;
    const { summary, prompt } = parseSynthesis(reply);
    expect(prompt).toBeNull();
    expect(summary).toContain('free text');
    expect(summary).not.toContain('```');
  });
});
