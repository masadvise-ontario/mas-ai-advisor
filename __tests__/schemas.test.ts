import { describe, it, expect } from 'vitest';
import {
  registerBodySchema,
  turnBodySchema,
  privateBodySchema,
  chatFeedbackSchema,
} from '@/lib/schemas';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('registerBodySchema', () => {
  it('accepts a complete registration with email', () => {
    const result = registerBodySchema.safeParse({
      install_id: VALID_UUID,
      platform: 'claude',
      share_history: true,
      email: 'user@example.com',
      source: 'masadvise.org',
    });
    expect(result.success).toBe(true);
  });

  it('accepts registration without email (anonymous)', () => {
    const result = registerBodySchema.safeParse({
      install_id: VALID_UUID,
      platform: 'chatgpt',
      share_history: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing share_history (the required consent answer)', () => {
    const result = registerBodySchema.safeParse({
      install_id: VALID_UUID,
      platform: 'claude',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown platform', () => {
    const result = registerBodySchema.safeParse({
      install_id: VALID_UUID,
      platform: 'perplexity',
      share_history: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects malformed UUID', () => {
    const result = registerBodySchema.safeParse({
      install_id: 'not-a-uuid',
      platform: 'claude',
      share_history: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects malformed email', () => {
    const result = registerBodySchema.safeParse({
      install_id: VALID_UUID,
      platform: 'claude',
      share_history: true,
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });
});

describe('turnBodySchema', () => {
  it('accepts a valid turn event', () => {
    const result = turnBodySchema.safeParse({
      install_id: VALID_UUID,
      conversation_id: VALID_UUID,
      event_subtype: 'turn_started',
      payload: { pattern_identified: 'allard-prize' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a turn event without payload', () => {
    const result = turnBodySchema.safeParse({
      install_id: VALID_UUID,
      conversation_id: VALID_UUID,
      event_subtype: 'discovery_completed',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty event_subtype', () => {
    const result = turnBodySchema.safeParse({
      install_id: VALID_UUID,
      conversation_id: VALID_UUID,
      event_subtype: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('privateBodySchema', () => {
  it('accepts pause action', () => {
    const result = privateBodySchema.safeParse({
      install_id: VALID_UUID,
      conversation_id: VALID_UUID,
      action: 'pause',
    });
    expect(result.success).toBe(true);
  });

  it('accepts resume action', () => {
    const result = privateBodySchema.safeParse({
      install_id: VALID_UUID,
      conversation_id: VALID_UUID,
      action: 'resume',
    });
    expect(result.success).toBe(true);
  });

  it('accepts forget action', () => {
    const result = privateBodySchema.safeParse({
      install_id: VALID_UUID,
      conversation_id: VALID_UUID,
      action: 'forget',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing action (no default — Advisor must specify pause | resume | forget)', () => {
    const result = privateBodySchema.safeParse({
      install_id: VALID_UUID,
      conversation_id: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown action', () => {
    const result = privateBodySchema.safeParse({
      install_id: VALID_UUID,
      conversation_id: VALID_UUID,
      action: 'delete',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing conversation_id', () => {
    const result = privateBodySchema.safeParse({
      install_id: VALID_UUID,
      action: 'forget',
    });
    expect(result.success).toBe(false);
  });
});

describe('chatFeedbackSchema', () => {
  it('accepts a thumbs-up with no comment', () => {
    const result = chatFeedbackSchema.safeParse({
      assistant_message_index: 1,
      rating: 'up',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a thumbs-down with comment', () => {
    const result = chatFeedbackSchema.safeParse({
      assistant_message_index: 3,
      rating: 'down',
      comment: 'too generic',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a comment-only feedback (no rating)', () => {
    const result = chatFeedbackSchema.safeParse({
      assistant_message_index: 5,
      rating: null,
      comment: 'love this',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty payload (no rating + no comment)', () => {
    const result = chatFeedbackSchema.safeParse({
      assistant_message_index: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only comment without rating', () => {
    const result = chatFeedbackSchema.safeParse({
      assistant_message_index: 1,
      comment: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown rating', () => {
    const result = chatFeedbackSchema.safeParse({
      assistant_message_index: 1,
      rating: 'maybe',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative message index', () => {
    const result = chatFeedbackSchema.safeParse({
      assistant_message_index: -1,
      rating: 'up',
    });
    expect(result.success).toBe(false);
  });
});
