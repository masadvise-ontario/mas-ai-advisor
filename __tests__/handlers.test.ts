import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};
const mockPool = {
  connect: vi.fn(async () => mockClient),
  query: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  getPool: () => mockPool,
  SCOPE: 'mas-public-advisor',
}));

import {
  registerInstall,
  recordTurn,
  setConversationPrivacy,
  UnknownInstallError,
} from '@/lib/handlers';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

beforeEach(() => {
  mockClient.query.mockReset();
  mockClient.release.mockReset();
  mockPool.connect.mockClear();
  mockPool.query.mockReset();
});

describe('registerInstall', () => {
  it('inserts install + event in a transaction and releases the client', async () => {
    mockClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

    const result = await registerInstall({
      install_id: VALID_UUID,
      platform: 'claude',
      share_history: true,
      email: 'user@example.com',
    });

    expect(result).toEqual({ ok: true });
    const calls = mockClient.query.mock.calls.map(([sql]) => sql);
    expect(calls[0]).toBe('BEGIN');
    expect(calls[1]).toMatch(/INSERT INTO mas_journey_installs/);
    expect(calls[2]).toMatch(/INSERT INTO mas_journey_events/);
    expect(calls[3]).toBe('COMMIT');
    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it('rolls back and rethrows on a query error', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error('boom')) // first INSERT
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // ROLLBACK

    await expect(
      registerInstall({
        install_id: VALID_UUID,
        platform: 'claude',
        share_history: false,
      }),
    ).rejects.toThrow('boom');

    const calls = mockClient.query.mock.calls.map(([sql]) => sql);
    expect(calls).toContain('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledOnce();
  });
});

describe('recordTurn', () => {
  it('throws UnknownInstallError if the install_id is not in mas_journey_installs', async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(
      recordTurn({
        install_id: VALID_UUID,
        conversation_id: VALID_UUID,
        event_subtype: 'turn_started',
      }),
    ).rejects.toBeInstanceOf(UnknownInstallError);
  });

  it('no-ops with ignored=true if share_history is false', async () => {
    mockPool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ share_history: false }],
    });

    const result = await recordTurn({
      install_id: VALID_UUID,
      conversation_id: VALID_UUID,
      event_subtype: 'turn_started',
    });

    expect(result).toEqual({
      ok: true,
      ignored: true,
      reason: 'no_share_history',
    });
    // Only the SELECT ran; no INSERT.
    expect(mockPool.query).toHaveBeenCalledOnce();
  });

  it('inserts an advisor_conversation_turn event when share_history is true', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ share_history: true }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const result = await recordTurn({
      install_id: VALID_UUID,
      conversation_id: VALID_UUID,
      event_subtype: 'discovery_completed',
      payload: { pattern: 'allard-prize' },
    });

    expect(result).toEqual({ ok: true });
    expect(mockPool.query).toHaveBeenCalledTimes(2);
    const insertCall = mockPool.query.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO mas_journey_events/);
    const payloadJson = (insertCall[1] as unknown[])[3] as string;
    expect(JSON.parse(payloadJson)).toMatchObject({
      conversation_id: VALID_UUID,
      event_subtype: 'discovery_completed',
      pattern: 'allard-prize',
    });
  });
});

describe('setConversationPrivacy', () => {
  it('action=forget deletes prior turn events and returns deleted_count', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rowCount: 3, rows: [] }) // DELETE
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // INSERT event
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

    const result = await setConversationPrivacy({
      install_id: VALID_UUID,
      conversation_id: VALID_UUID,
      action: 'forget',
    });

    expect(result).toEqual({ ok: true, action: 'forget', deleted_count: 3 });
    const calls = mockClient.query.mock.calls.map(([sql]) => sql);
    expect(calls[1]).toMatch(/DELETE FROM mas_journey_events/);
    expect(calls[2]).toMatch(/INSERT INTO mas_journey_events/);
  });

  it('action=pause emits advisor_conversation_paused without deleting events', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // INSERT event
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

    const result = await setConversationPrivacy({
      install_id: VALID_UUID,
      conversation_id: VALID_UUID,
      action: 'pause',
    });

    expect(result).toEqual({ ok: true, action: 'pause' });
    const calls = mockClient.query.mock.calls.map(([sql]) => sql);
    expect(calls).not.toContain(expect.stringMatching(/DELETE FROM/));
    const insertParams = mockClient.query.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('INSERT INTO mas_journey_events'),
    )?.[1] as unknown[];
    expect(insertParams[2]).toBe('advisor_conversation_paused');
  });

  it('action=resume emits advisor_conversation_resumed', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // INSERT event
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

    const result = await setConversationPrivacy({
      install_id: VALID_UUID,
      conversation_id: VALID_UUID,
      action: 'resume',
    });

    expect(result).toEqual({ ok: true, action: 'resume' });
    const insertParams = mockClient.query.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('INSERT INTO mas_journey_events'),
    )?.[1] as unknown[];
    expect(insertParams[2]).toBe('advisor_conversation_resumed');
  });
});
