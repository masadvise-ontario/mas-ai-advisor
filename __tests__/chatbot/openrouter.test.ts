import { describe, it, expect, vi } from 'vitest';
import { chatCompletion } from '@/lib/chatbot/openrouter';

function fakeFetchOk(body: unknown) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

describe('chatCompletion', () => {
  it('parses an OpenRouter response with cached prompt tokens', async () => {
    const fetchImpl = fakeFetchOk({
      choices: [{ message: { content: 'hello' } }],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 50,
        prompt_tokens_details: { cached_tokens: 800 },
        cost_details: { upstream_inference_cost: 0.0012 },
      },
    });
    const result = await chatCompletion({
      apiKey: 'fake',
      systemText: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      fetchImpl,
    });
    expect(result.reply).toBe('hello');
    expect(result.usage).toEqual({
      inputTokens: 200,
      cachedInputTokens: 800,
      outputTokens: 50,
      upstreamCostUsd: 0.0012,
    });
  });

  it('treats absent cached_tokens as zero', async () => {
    const fetchImpl = fakeFetchOk({
      choices: [{ message: { content: 'x' } }],
      usage: { prompt_tokens: 500, completion_tokens: 10 },
    });
    const result = await chatCompletion({
      apiKey: 'fake',
      systemText: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      fetchImpl,
    });
    expect(result.usage.cachedInputTokens).toBe(0);
    expect(result.usage.inputTokens).toBe(500);
  });

  it('sends cache_control: ephemeral on the system block', async () => {
    let captured: Record<string, unknown> | undefined;
    const fetchImpl = (async (_url: unknown, init: { body: string }) => {
      captured = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 0, completion_tokens: 0 },
        }),
        text: async () => '',
      };
    }) as unknown as typeof fetch;
    await chatCompletion({
      apiKey: 'fake',
      systemText: 'system content',
      messages: [{ role: 'user', content: 'hi' }],
      fetchImpl,
    });
    const sys = (captured?.messages as Array<{ role: string; content: Array<{ cache_control: unknown }> }>)[0];
    expect(sys.role).toBe('system');
    expect(sys.content[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('sends model anthropic/claude-haiku-4.5 by default', async () => {
    let captured: { model?: string } | undefined;
    const fetchImpl = (async (_url: unknown, init: { body: string }) => {
      captured = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '' } }],
          usage: { prompt_tokens: 0, completion_tokens: 0 },
        }),
        text: async () => '',
      };
    }) as unknown as typeof fetch;
    await chatCompletion({
      apiKey: 'fake',
      systemText: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      fetchImpl,
    });
    expect(captured?.model).toBe('anthropic/claude-haiku-4.5');
  });

  it('throws when fetch returns non-OK', async () => {
    const fetchImpl = (async () => ({
      ok: false,
      status: 429,
      json: async () => ({}),
      text: async () => 'rate limited',
    })) as unknown as typeof fetch;
    await expect(
      chatCompletion({
        apiKey: 'fake',
        systemText: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
        fetchImpl,
      }),
    ).rejects.toThrow(/OpenRouter 429/);
  });

  it('throws on missing apiKey', async () => {
    await expect(
      chatCompletion({
        apiKey: '',
        systemText: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toThrow(/apiKey required/);
  });
});
