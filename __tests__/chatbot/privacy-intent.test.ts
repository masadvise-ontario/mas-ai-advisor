import { describe, it, expect, vi } from 'vitest';
import {
  detectPrivacyIntent,
  getConversationPrivacyState,
} from '@/lib/chatbot/privacy-intent';
import type { ChatbotDb } from '@/lib/chatbot/types';

function fakeDb(response: { rowCount: number; rows: Array<{ event_type: string }> }) {
  const query = vi.fn(async () => response);
  return { query } as unknown as ChatbotDb;
}

describe('detectPrivacyIntent', () => {
  it.each([
    "Let's go off the record for a minute",
    "Pause the logging please",
    "Don't log this next bit",
    "This part is private",
    "Stop logging just for now",
  ])('detects pause intent in: %s', (msg) => {
    expect(detectPrivacyIntent(msg)).toBe('pause');
  });

  it.each([
    'Back on the record',
    'You can resume logging',
    "We're done with the private part",
    'You can log again',
  ])('detects resume intent in: %s', (msg) => {
    expect(detectPrivacyIntent(msg)).toBe('resume');
  });

  it.each([
    'Forget what I just said',
    'Delete this conversation',
    'Mark this conversation private',
    'Turn off telemetry',
  ])('detects forget intent in: %s', (msg) => {
    expect(detectPrivacyIntent(msg)).toBe('forget');
  });

  it('returns null for regular discovery talk', () => {
    expect(detectPrivacyIntent('We run a small refugee-services charity')).toBeNull();
    expect(detectPrivacyIntent('What should I do about donor outreach?')).toBeNull();
  });

  it('prefers forget over pause when both match', () => {
    expect(detectPrivacyIntent('Delete this conversation, off the record')).toBe('forget');
  });
});

describe('getConversationPrivacyState', () => {
  it('returns active when no privacy events recorded', async () => {
    expect(await getConversationPrivacyState(fakeDb({ rowCount: 0, rows: [] }), 'i', 'c')).toBe('active');
  });

  it('returns paused on advisor_conversation_paused', async () => {
    expect(
      await getConversationPrivacyState(
        fakeDb({ rowCount: 1, rows: [{ event_type: 'advisor_conversation_paused' }] }),
        'i',
        'c',
      ),
    ).toBe('paused');
  });

  it('returns forgotten on advisor_conversation_private', async () => {
    expect(
      await getConversationPrivacyState(
        fakeDb({ rowCount: 1, rows: [{ event_type: 'advisor_conversation_private' }] }),
        'i',
        'c',
      ),
    ).toBe('forgotten');
  });

  it('returns active on advisor_conversation_resumed (latest)', async () => {
    expect(
      await getConversationPrivacyState(
        fakeDb({ rowCount: 1, rows: [{ event_type: 'advisor_conversation_resumed' }] }),
        'i',
        'c',
      ),
    ).toBe('active');
  });
});
