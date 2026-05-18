/**
 * Builds an Agent Skills (SKILL.md) bundle for the MAS AI Advisor.
 *
 * Output structure (per https://agentskills.io spec):
 *
 *   build/skill/
 *   └── mas-ai-advisor/
 *       ├── SKILL.md              (YAML frontmatter + Markdown body)
 *       └── knowledge/
 *           └── manifest.md
 *
 * The Skill is publishable to skills.sh and installable in any conformant
 * client (claude.ai, ChatGPT, Gemini CLI, Cursor, Goose, VS Code, JetBrains,
 * etc.) via `npx skills add ./build/skill/mas-ai-advisor`.
 *
 * Run with: pnpm bundle:skill
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const MANIFEST_PATH = join(HERE, 'manifest.json');
const OUTPUT_DIR = join(REPO_ROOT, 'build', 'skill');

interface Manifest {
  adapter: string;
  platform: string;
  version: string;
  publish: {
    skill_name: string;
    skill_description: string;
    [key: string]: unknown;
  };
  system_prompt: {
    source: string;
    strip_frontmatter: boolean;
    output: string;
  };
  knowledge: {
    baked: Array<{
      source: string;
      output: string;
      description: string;
    }>;
  };
}

function stripYamlFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---\n')) return markdown;
  const end = markdown.indexOf('\n---\n', 4);
  if (end === -1) return markdown;
  return markdown.slice(end + 5).replace(/^\n+/, '');
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function readManifest(): Promise<Manifest> {
  const raw = await readFile(MANIFEST_PATH, 'utf8');
  return JSON.parse(raw) as Manifest;
}

async function emitFile(relPath: string, contents: string): Promise<number> {
  const fullPath = join(OUTPUT_DIR, relPath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, contents, 'utf8');
  return Buffer.byteLength(contents, 'utf8');
}

function buildSkillMd(
  manifest: Manifest,
  bodyMarkdown: string,
): string {
  // Per the Agent Skills spec, frontmatter requires `name` + `description`.
  // We include `version` as a non-required extension for traceability.
  const frontmatter = [
    '---',
    `name: ${manifest.publish.skill_name}`,
    `description: ${JSON.stringify(manifest.publish.skill_description)}`,
    `version: ${manifest.version}`,
    '---',
    '',
  ].join('\n');
  return frontmatter + bodyMarkdown;
}

async function main(): Promise<void> {
  const manifest = await readManifest();

  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const sourceSystemPrompt = await readFile(
    join(REPO_ROOT, manifest.system_prompt.source),
    'utf8',
  );
  const systemPromptBody = manifest.system_prompt.strip_frontmatter
    ? stripYamlFrontmatter(sourceSystemPrompt)
    : sourceSystemPrompt;

  const skillMd = buildSkillMd(manifest, systemPromptBody);
  const skillBytes = await emitFile(manifest.system_prompt.output, skillMd);

  const knowledgeOut: Array<{
    source: string;
    output: string;
    bytes: number;
    sha256: string;
  }> = [];
  for (const entry of manifest.knowledge.baked) {
    const sourcePath = join(REPO_ROOT, entry.source);
    const contents = await readFile(sourcePath, 'utf8');
    const bytes = await emitFile(entry.output, contents);
    knowledgeOut.push({
      source: entry.source,
      output: entry.output,
      bytes,
      sha256: sha256(contents),
    });
  }

  const bundleManifest = {
    adapter: manifest.adapter,
    platform: manifest.platform,
    version: manifest.version,
    skill: {
      name: manifest.publish.skill_name,
      output: manifest.system_prompt.output,
      bytes: skillBytes,
      sha256: sha256(skillMd),
    },
    knowledge: knowledgeOut,
    built_at: new Date().toISOString(),
  };

  await emitFile(
    'bundle.json',
    JSON.stringify(bundleManifest, null, 2) + '\n',
  );

  // eslint-disable-next-line no-console
  console.log(`bundled ${1 + knowledgeOut.length} file(s) → build/skill/`);
  // eslint-disable-next-line no-console
  console.log(`  ${manifest.system_prompt.output}  (${skillBytes} bytes)`);
  for (const k of knowledgeOut) {
    // eslint-disable-next-line no-console
    console.log(`  ${k.output}  (${k.bytes} bytes)`);
  }
  // eslint-disable-next-line no-console
  console.log(`  bundle.json`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[bundle:skill] failed:', err);
  process.exit(1);
});
