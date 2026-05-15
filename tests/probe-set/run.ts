#!/usr/bin/env tsx
/**
 * Probe-set harness for the MAS AI Advisor system prompt.
 *
 * Loads prompts/system.md and tests/probe-set/probes.json, runs each probe
 * against Claude (the platform that gives us a clean API loop), and uses a
 * cheaper Claude as the LLM judge against each probe's `expects` list.
 *
 * Usage:
 *   pnpm test:probes                          # all probes, Opus 4.7
 *   pnpm test:probes --filter=consent         # one category
 *   ADVISOR_MODEL=claude-sonnet-4-6 pnpm test:probes
 *
 * Requires ANTHROPIC_API_KEY in env. Writes results to
 * tests/probe-set/results-<timestamp>.json.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import fs from "node:fs";
import path from "node:path";

const ADVISOR_MODEL = process.env.ADVISOR_MODEL ?? "claude-opus-4-7";
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "claude-haiku-4-5";

const scriptDir = path.dirname(path.resolve(process.argv[1]!));
const repoRoot = path.resolve(scriptDir, "..", "..");
const promptPath = path.join(repoRoot, "prompts", "system.md");
const probesPath = path.join(repoRoot, "tests", "probe-set", "probes.json");

function stripFrontmatter(md: string): string {
  if (!md.startsWith("---\n")) return md;
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) return md;
  return md.slice(end + 5).trimStart();
}

const systemPrompt = stripFrontmatter(fs.readFileSync(promptPath, "utf-8"));

const probeSchema = z.object({
  id: z.string(),
  category: z.string(),
  setup_turn: z.string().optional(),
  user_prompt: z.string(),
  expects: z.array(z.string()),
});
type Probe = z.infer<typeof probeSchema>;

const probes: Probe[] = z
  .array(probeSchema)
  .parse(JSON.parse(fs.readFileSync(probesPath, "utf-8")));

const judgeOutputSchema = z.object({
  per_expectation: z.array(
    z.object({
      expectation: z.string(),
      met: z.boolean(),
      note: z.string(),
    }),
  ),
  overall_passed: z.boolean(),
  summary: z.string(),
});
type Judgment = z.infer<typeof judgeOutputSchema>;

interface ProbeResult {
  probe_id: string;
  category: string;
  advisor_response: string;
  judgment: Judgment;
  duration_ms: number;
  tokens_in: number;
  tokens_out: number;
  cache_read_tokens: number;
}

const client = new Anthropic();

async function runProbe(probe: Probe): Promise<ProbeResult> {
  const start = Date.now();

  const messages: Anthropic.MessageParam[] = [];
  if (probe.setup_turn) {
    messages.push({
      role: "user",
      content:
        `[TEST HARNESS — PRIOR-TURN CONTEXT]\n\n${probe.setup_turn}\n\n` +
        `For the next user turn, continue from this established state. ` +
        `Do not narrate the state back; just respond to my next message in character.`,
    });
    messages.push({
      role: "assistant",
      content: "Understood — continuing from that state.",
    });
  }
  messages.push({ role: "user", content: probe.user_prompt });

  const advisorResponse = await client.messages.create({
    model: ADVISOR_MODEL,
    max_tokens: 16000,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  });

  const advisorText = advisorResponse.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const judgePrompt = `You are evaluating a single response from the MAS AI Advisor against a probe-set expectation list. The Advisor is a public-facing agent nonprofits install in their own LLM; it must follow a specific system prompt covering consent, discovery-first behaviour, vocabulary translation, case-study surfacing, restraint, and a conversation-private intent.

PROBE METADATA
- ID: ${probe.id}
- Category: ${probe.category}
- Prior-turn setup: ${probe.setup_turn ?? "(none — this is the first turn of a fresh conversation; the consent script should fire)"}
- User said this turn: ${JSON.stringify(probe.user_prompt)}

EXPECTATIONS (the Advisor's response must satisfy ALL of these):
${probe.expects.map((e, i) => `${i + 1}. ${e}`).join("\n")}

ADVISOR'S ACTUAL RESPONSE:
${JSON.stringify(advisorText)}

For each expectation, judge whether the response met it. Be strict — partial satisfaction is "met: false" with a clear note explaining what was missing. Set overall_passed=true only when every expectation is met.`;

  const judgment = await client.messages.parse({
    model: JUDGE_MODEL,
    max_tokens: 4000,
    messages: [{ role: "user", content: judgePrompt }],
    output_config: { format: zodOutputFormat(judgeOutputSchema) },
  });

  return {
    probe_id: probe.id,
    category: probe.category,
    advisor_response: advisorText,
    judgment: judgment.parsed_output!,
    duration_ms: Date.now() - start,
    tokens_in: advisorResponse.usage.input_tokens,
    tokens_out: advisorResponse.usage.output_tokens,
    cache_read_tokens: advisorResponse.usage.cache_read_input_tokens ?? 0,
  };
}

async function main() {
  const filterArg = process.argv.find((a) => a.startsWith("--filter="));
  const filter = filterArg?.split("=")[1];
  const probesToRun = filter ? probes.filter((p) => p.category === filter) : probes;

  if (probesToRun.length === 0) {
    console.error(
      `No probes matched filter '${filter}'. Categories: ${[...new Set(probes.map((p) => p.category))].join(", ")}`,
    );
    process.exit(1);
  }

  console.log(
    `Running ${probesToRun.length} probe${probesToRun.length === 1 ? "" : "s"} against ${ADVISOR_MODEL} (judge: ${JUDGE_MODEL})\n`,
  );

  const results: ProbeResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const probe of probesToRun) {
    process.stdout.write(`[${probe.id}] ${probe.category} ... `);
    try {
      const result = await runProbe(probe);
      results.push(result);
      const secs = (result.duration_ms / 1000).toFixed(1);
      if (result.judgment.overall_passed) {
        console.log(`PASS (${secs}s, ${result.tokens_out} out tokens)`);
        passed++;
      } else {
        console.log(`FAIL (${secs}s)`);
        const failures = result.judgment.per_expectation.filter((e) => !e.met);
        for (const f of failures) {
          console.log(`    - ${f.expectation}`);
          console.log(`      -> ${f.note}`);
        }
        failed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`ERROR: ${msg}`);
      failed++;
    }
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const outPath = path.join(
    repoRoot,
    "tests",
    "probe-set",
    `results-${timestamp}.json`,
  );
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        advisor_model: ADVISOR_MODEL,
        judge_model: JUDGE_MODEL,
        ran_at: new Date().toISOString(),
        passed,
        failed,
        results,
      },
      null,
      2,
    ),
  );

  console.log(`\n${passed}/${probesToRun.length} passed (${failed} failed)`);
  console.log(`Results: ${outPath}`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
