/**
 * Assembles the Claude Project upload bundle from prompts/system.md and
 * knowledge/. Reads manifest.json for the input list; writes to
 * build/claude-project/.
 *
 * Run with: pnpm bundle:claude-project
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const MANIFEST_PATH = join(HERE, 'manifest.json');
const OUTPUT_DIR = join(REPO_ROOT, 'build', 'claude-project');

interface Manifest {
  adapter: string;
  platform: string;
  version: string;
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
    kb_sources_pending: Array<{
      kb_source: string;
      description: string;
      audience_scope: string;
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

async function emitFile(
  relativePath: string,
  contents: string,
): Promise<{ path: string; bytes: number; sha256: string }> {
  const target = join(OUTPUT_DIR, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents, 'utf8');
  return {
    path: relativePath,
    bytes: Buffer.byteLength(contents, 'utf8'),
    sha256: sha256(contents),
  };
}

async function main(): Promise<void> {
  const manifest = await readManifest();

  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const emitted: Array<{ path: string; bytes: number; sha256: string }> = [];

  // System prompt
  const sourcePath = join(REPO_ROOT, manifest.system_prompt.source);
  const promptRaw = await readFile(sourcePath, 'utf8');
  const promptBody = manifest.system_prompt.strip_frontmatter
    ? stripYamlFrontmatter(promptRaw)
    : promptRaw;
  emitted.push(await emitFile(manifest.system_prompt.output, promptBody));

  // Baked knowledge
  for (const entry of manifest.knowledge.baked) {
    const src = join(REPO_ROOT, entry.source);
    const body = await readFile(src, 'utf8');
    emitted.push(await emitFile(entry.output, body));
  }

  // Provenance file
  const provenance = {
    adapter: manifest.adapter,
    platform: manifest.platform,
    version: manifest.version,
    built_at: new Date().toISOString(),
    repo_root: relative(process.cwd(), REPO_ROOT) || '.',
    files: emitted,
    kb_sources_pending: manifest.knowledge.kb_sources_pending,
  };
  await emitFile('bundle.json', JSON.stringify(provenance, null, 2) + '\n');

  console.log(
    `\nbundled ${emitted.length + 1} file(s) → ${relative(process.cwd(), OUTPUT_DIR)}/`,
  );
  for (const file of emitted) {
    console.log(`  ${file.path}  (${file.bytes} bytes)`);
  }
  console.log('  bundle.json');
  if (manifest.knowledge.kb_sources_pending.length > 0) {
    console.log(
      `\n${manifest.knowledge.kb_sources_pending.length} KB source(s) pending — see bundle.json.kb_sources_pending. Pull them in when the shared-KB build pipeline lands.`,
    );
  }
}

main().catch((err) => {
  console.error('[bundle] failed:', err);
  process.exit(1);
});
