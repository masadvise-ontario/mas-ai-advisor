import { describe, it, expect, vi } from 'vitest';
import {
  CONVERSATIONS_PER_IP_PER_DAY,
  TURNS_PER_CONVERSATION,
  checkAndIncrementConversation,
  checkAndIncrementTurn,
} from '@/lib/chatbot/rate-limit';
import type { ChatbotDb } from '@/lib/chatbot/types';

function fakeDb(responses: Array<{ rowCount: number; rows: Array<Record<string, unknown>> }>) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let i = 0;
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    const next = responses[i++];
    if (!next) throw new Error(`fakeDb out of responses (call ${i})`);
    return next;
  });
  return { db: { query } as unknown as ChatbotDb, calls };
}

describe('checkAndIncrementConversation', () => {
  it('returns ok with remaining when under limit', async () => {
    const { db } = fakeDb([{ rowCount: 1, rows: [{ conversations_started: 3 }] }]);
    const result = await checkAndIncrementConversation(db, 'iphash', 5);
    expect(result).toEqual({ ok: true, remaining: 2 });
  });

  it('returns conversation_cap when at limit (zero rows updated)', async () => {
    const { db } = fakeDb([{ rowCount: 0, rows: [] }]);
    const result = await checkAndIncrementConversation(db, 'iphash', 5);
    expect(result).toEqual({ ok: false, reason: 'conversation_cap' });
  });

  it('defaults limit to CONVERSATIONS_PER_IP_PER_DAY', async () => {
    const { db, calls } = fakeDb([{ rowCount: 1, rows: [{ conversations_started: 1 }] }]);
    await checkAndIncrementConversation(db, 'iphash');
    expect(calls[0].params?.[1]).toBe(CONVERSATIONS_PER_IP_PER_DAY);
  });
});

describe('checkAndIncrementTurn', () => {
  it('returns ok with remaining when under turn cap', async () => {
    const { db } = fakeDb([{ rowCount: 1, rows: [{ turn_count: 10 }] }]);
    const result = await checkAndIncrementTurn(db, 'conv-id', 15);
    expect(result).toEqual({ ok: true, remaining: 5 });
  });

  it('returns turn_cap when at limit', async () => {
    const { db } = fakeDb([{ rowCount: 0, rows: [] }]);
    const result = await checkAndIncrementTurn(db, 'conv-id', 15);
    expect(result).toEqual({ ok: false, reason: 'turn_cap' });
  });

  it('defaults limit to TURNS_PER_CONVERSATION', async () => {
    const { db, calls } = fakeDb([{ rowCount: 1, rows: [{ turn_count: 1 }] }]);
    await checkAndIncrementTurn(db, 'conv-id');
    expect(calls[0].params?.[1]).toBe(TURNS_PER_CONVERSATION);
  });
});
