import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHATBOT_OVERLAY, getChatbotSystemPrompt } from '@/lib/chatbot/system-prompt';

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
      '---\nversion: 0.1\n---\n\n# Advisor body\n\nDo the discovery.',
    );
    const prompt = getChatbotSystemPrompt({ repoRoot: root, bustCache: true });
    expect(prompt.startsWith(CHATBOT_OVERLAY)).toBe(true);
    expect(prompt).toContain('# Advisor body');
    expect(prompt).not.toContain('version: 0.1');
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
});
