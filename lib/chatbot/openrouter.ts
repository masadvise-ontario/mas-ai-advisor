// OpenRouter chat completion wrapper for the chatbot surface.
// Probe-verified 2026-05-19: cache_control passthrough works on
// anthropic/claude-haiku-4.5; cached prefix shows up as
// usage.prompt_tokens_details.cached_tokens on the 2nd+ call.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';
const DEFAULT_MAX_TOKENS = 800;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  apiKey: string;
  systemText: string;
  messages: ChatMessage[];
  maxTokens?: number;
  model?: string;
  fetchImpl?: typeof fetch;
}

export interface ChatCompletionUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  upstreamCostUsd: number;
}

export interface ChatCompletionResult {
  reply: string;
  usage: ChatCompletionUsage;
}

interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
  cost_details?: {
    upstream_inference_cost?: number;
  };
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: OpenRouterUsage;
}

export async function chatCompletion({
  apiKey,
  systemText,
  messages,
  maxTokens = DEFAULT_MAX_TOKENS,
  model = DEFAULT_MODEL,
  fetchImpl = fetch,
}: ChatCompletionRequest): Promise<ChatCompletionResult> {
  if (!apiKey) throw new Error('apiKey required');
  if (!systemText) throw new Error('systemText required');

  const body = {
    model,
    max_tokens: maxTokens,
    usage: { include: true },
    messages: [
      {
        role: 'system' as const,
        content: [
          {
            type: 'text' as const,
            text: systemText,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
      },
      ...messages,
    ],
  };

  const res = await fetchImpl(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://masadvise.org/ai',
      'X-Title': 'MAS AI Advisor',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as OpenRouterResponse;
  const reply = json.choices?.[0]?.message?.content ?? '';

  const usage = json.usage;
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const promptTotal = usage?.prompt_tokens ?? 0;

  return {
    reply,
    usage: {
      inputTokens: Math.max(0, promptTotal - cached),
      cachedInputTokens: cached,
      outputTokens: usage?.completion_tokens ?? 0,
      upstreamCostUsd: usage?.cost_details?.upstream_inference_cost ?? 0,
    },
  };
}
