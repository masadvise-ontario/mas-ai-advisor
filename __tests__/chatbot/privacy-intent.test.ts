import { describe, it, expect, vi } from 'vitest';
import {
  detectPrivacyIntent,
  detectPrivacyMarker,
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

describe('detectPrivacyIntent — expanded patterns (2026-05-23 audit)', () => {
  it.each([
    "don't record this",
    "Don't record this, but I'm frustrated",
    'please stop recording',
    "Keep this private",
    'Keep this between us',
    'not for the record',
    'private mode please',
    'stop tracking me',
    "don't save the conversation",
  ])('matches pause: %s', (input) => {
    expect(detectPrivacyIntent(input)).toBe('pause');
  });

  it.each([
    'wipe this conversation',
    'purge this conversation',
    'erase the conversation',
    'forget everything',
    'forget all of this',
    'delete everything',
  ])('matches forget: %s', (input) => {
    expect(detectPrivacyIntent(input)).toBe('forget');
  });

  it.each([
    'turn the logging back on',
    'start logging again',
  ])('matches resume: %s', (input) => {
    expect(detectPrivacyIntent(input)).toBe('resume');
  });
});

describe('detectPrivacyMarker', () => {
  it('detects [PRIVACY:pause] in the LLM reply and strips it', () => {
    const reply = "Got it, paused logging.\n\n[PRIVACY:pause]";
    const hit = detectPrivacyMarker(reply);
    expect(hit?.action).toBe('pause');
    expect(hit?.cleaned).toBe('Got it, paused logging.');
  });

  it('detects [PRIVACY:forget] case-insensitively', () => {
    const hit = detectPrivacyMarker("Done — that's deleted. [privacy:FORGET]");
    expect(hit?.action).toBe('forget');
    expect(hit?.cleaned).not.toContain('PRIVACY');
  });

  it('detects [PRIVACY:resume] with whitespace inside the brackets', () => {
    const hit = detectPrivacyMarker("Logging back on. [PRIVACY : resume ]");
    expect(hit?.action).toBe('resume');
  });

  it('returns null when no marker is present', () => {
    expect(detectPrivacyMarker('Just a normal reply.')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(detectPrivacyMarker('')).toBeNull();
  });
});
