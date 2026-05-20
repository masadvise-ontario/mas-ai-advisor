import { describe, it, expect } from 'vitest';
import { installIdFromEmail, anonymousInstallId } from '@/lib/chatbot/install-id';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('installIdFromEmail', () => {
  it('produces a valid v5 UUID', () => {
    expect(installIdFromEmail('user@example.com')).toMatch(UUID_PATTERN);
  });

  it('is deterministic across calls', () => {
    expect(installIdFromEmail('user@example.com')).toBe(installIdFromEmail('user@example.com'));
  });

  it('normalizes case and whitespace', () => {
    expect(installIdFromEmail('USER@example.com')).toBe(installIdFromEmail('user@example.com'));
    expect(installIdFromEmail(' user@example.com  ')).toBe(installIdFromEmail('user@example.com'));
  });

  it('different emails produce different ids', () => {
    expect(installIdFromEmail('a@example.com')).not.toBe(installIdFromEmail('b@example.com'));
  });

  it('throws on empty email', () => {
    expect(() => installIdFromEmail('')).toThrow(/email required/);
  });
});

describe('anonymousInstallId', () => {
  it('produces a v4 UUID', () => {
    expect(anonymousInstallId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('produces a different id each call', () => {
    expect(anonymousInstallId()).not.toBe(anonymousInstallId());
  });
});
