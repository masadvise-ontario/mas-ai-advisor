import { describe, it, expect, vi } from 'vitest';
import { recordTurnUsage, getDailySpendUsd } from '@/lib/chatbot/spend';
import type { ChatbotDb } from '@/lib/chatbot/types';

function fakeDb(responses: Array<{ rowCount: number; rows: Array<Record<string, unknown>> }>) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let i = 0;
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return responses[i++] ?? { rowCount: 0, rows: [] };
  });
  return { db: { query } as unknown as ChatbotDb, calls };
}

describe('recordTurnUsage', () => {
  it('writes both the per-conversation update and the daily aggregate upsert', async () => {
    const { db, calls } = fakeDb([
      { rowCount: 1, rows: [] },
      { rowCount: 1, rows: [] },
    ]);
    await recordTurnUsage(db, {
      conversationId: 'conv-1',
      inputTokens: 100,
      cachedInputTokens: 9000,
      outputTokens: 50,
      upstreamCostUsd: 0.0012,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toMatch(/UPDATE chatbot_conversations/);
    expect(calls[0].params).toEqual(['conv-1', 100, 9000, 50, 0.0012]);
    expect(calls[1].sql).toMatch(/INSERT INTO chatbot_spend/);
    expect(calls[1].params).toEqual([100, 9000, 50, 0.0012]);
  });
});

describe('getDailySpendUsd', () => {
  it('returns 0 when no row for the day', async () => {
    const { db } = fakeDb([{ rowCount: 0, rows: [] }]);
    expect(await getDailySpendUsd(db)).toBe(0);
  });

  it('parses the numeric string to a number', async () => {
    const { db } = fakeDb([
      { rowCount: 1, rows: [{ upstream_cost_usd: '12.3456' }] },
    ]);
    expect(await getDailySpendUsd(db)).toBeCloseTo(12.3456);
  });
});
