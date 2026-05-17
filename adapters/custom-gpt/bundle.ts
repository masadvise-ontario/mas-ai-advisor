/**
 * Assembles the ChatGPT Custom GPT upload bundle from prompts/system.md,
 * knowledge/, and lib/schemas.ts. Reads manifest.json for the input list and
 * writes to build/custom-gpt/.
 *
 * Emits:
 *   build/custom-gpt/system-prompt.md      — paste into Custom GPT "Instructions"
 *   build/custom-gpt/knowledge/manifest.md — upload as knowledge file
 *   build/custom-gpt/action-schema.json    — paste into Custom GPT "Actions"
 *   build/custom-gpt/bundle.json           — provenance
 *
 * Run with: pnpm bundle:custom-gpt
 *
 * Optional env:
 *   MAS_ADVISOR_API_BASE_URL  Overrides manifest.action.default_server_url for
 *                             the OpenAPI servers[0].url field. Use the
 *                             deployed Vercel URL once it's stable.
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import {
  privateBodySchema,
  registerBodySchema,
  turnBodySchema,
} from '@/lib/schemas';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const MANIFEST_PATH = join(HERE, 'manifest.json');
const OUTPUT_DIR = join(REPO_ROOT, 'build', 'custom-gpt');

type SchemaName = 'registerBodySchema' | 'turnBodySchema' | 'privateBodySchema';

const SCHEMAS: Record<SchemaName, z.ZodTypeAny> = {
  registerBodySchema,
  turnBodySchema,
  privateBodySchema,
};

interface ManifestOperation {
  operationId: string;
  summary: string;
  method: 'POST';
  path: string;
  request_schema: SchemaName;
  proxies: string;
}

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
  action: {
    output: string;
    openapi_version: string;
    default_server_url: string;
    server_url_env: string;
    auth: {
      type: 'apiKey';
      in: 'header';
      name: string;
      notes: string;
    };
    operations: ManifestOperation[];
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

function jsonSchemaFromZod(schema: z.ZodTypeAny): Record<string, unknown> {
  const generated = z.toJSONSchema(schema) as Record<string, unknown>;
  // OpenAPI 3.1 schema objects don't need (and Custom GPT Builder warns on)
  // the $schema field at the subschema level. Strip it.
  const { $schema: _drop, ...rest } = generated;
  return rest;
}

function buildOpenApi(manifest: Manifest, serverUrl: string): unknown {
  const paths: Record<string, unknown> = {};
  for (const op of manifest.action.operations) {
    const requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: jsonSchemaFromZod(SCHEMAS[op.request_schema]),
        },
      },
    };
    paths[op.path] = {
      [op.method.toLowerCase()]: {
        operationId: op.operationId,
        summary: op.summary,
        requestBody,
        responses: {
          '200': {
            description: 'Accepted. Server returns `{ ok: true }` on success or `{ ok: false }` on a fail-open transient error.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                  },
                  required: ['ok'],
                },
              },
            },
          },
          '400': {
            description: 'Invalid request body.',
          },
          '401': {
            description: 'Missing or invalid API key.',
          },
        },
      },
    };
  }

  return {
    openapi: manifest.action.openapi_version,
    info: {
      title: 'MAS AI Advisor — telemetry API',
      version: manifest.version,
      description:
        'Three endpoints called by the MAS AI Advisor inside a ChatGPT Custom GPT: register_install (first-turn consent), record_turn (per-turn telemetry under share_history: true), mark_conversation_private (stop telemetry and purge prior turns).',
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: manifest.action.auth.type,
          in: manifest.action.auth.in,
          name: manifest.action.auth.name,
        },
      },
    },
    security: [{ ApiKeyAuth: [] }],
    paths,
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

  // OpenAPI action schema
  const serverUrlOverride = process.env[manifest.action.server_url_env];
  const serverUrl = serverUrlOverride ?? manifest.action.default_server_url;
  const openApi = buildOpenApi(manifest, serverUrl);
  const openApiJson = JSON.stringify(openApi, null, 2) + '\n';
  emitted.push(await emitFile(manifest.action.output, openApiJson));

  // Provenance file
  const provenance = {
    adapter: manifest.adapter,
    platform: manifest.platform,
    version: manifest.version,
    built_at: new Date().toISOString(),
    repo_root: relative(process.cwd(), REPO_ROOT) || '.',
    action: {
      server_url: serverUrl,
      server_url_source: serverUrlOverride
        ? `env:${manifest.action.server_url_env}`
        : 'manifest.default_server_url',
      operations: manifest.action.operations.map((op) => ({
        operationId: op.operationId,
        method: op.method,
        path: op.path,
        proxies: op.proxies,
      })),
    },
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
  console.log(
    `\naction-schema.json servers[0].url = ${serverUrl}  (${serverUrlOverride ? `from $${manifest.action.server_url_env}` : 'manifest default'})`,
  );
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
