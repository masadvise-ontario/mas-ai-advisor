import { describe, it, expect, vi } from 'vitest';
import { isKilled } from '@/lib/chatbot/kill-switch';
import type { ChatbotDb } from '@/lib/chatbot/types';

function fakeDb(response: { rowCount: number; rows: Array<Record<string, unknown>> }) {
  const query = vi.fn(async () => response);
  return { query } as unknown as ChatbotDb;
}

describe('isKilled', () => {
  it('returns false when killed is false', async () => {
    expect(await isKilled(fakeDb({ rowCount: 1, rows: [{ killed: false }] }))).toBe(false);
  });

  it('returns true when killed is true', async () => {
    expect(await isKilled(fakeDb({ rowCount: 1, rows: [{ killed: true }] }))).toBe(true);
  });

  it('fails open (false) when the row is missing', async () => {
    expect(await isKilled(fakeDb({ rowCount: 0, rows: [] }))).toBe(false);
  });
});
