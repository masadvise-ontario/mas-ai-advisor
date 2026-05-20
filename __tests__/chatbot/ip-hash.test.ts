import { describe, it, expect } from 'vitest';
import { hashIp } from '@/lib/chatbot/ip-hash';

describe('hashIp', () => {
  it('produces a 64-char hex string', () => {
    expect(hashIp('1.2.3.4', 'salt')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different IPs produce different hashes', () => {
    expect(hashIp('1.2.3.4', 'salt')).not.toBe(hashIp('1.2.3.5', 'salt'));
  });

  it('different salts produce different hashes', () => {
    expect(hashIp('1.2.3.4', 'salt-a')).not.toBe(hashIp('1.2.3.4', 'salt-b'));
  });

  it('same input is deterministic', () => {
    expect(hashIp('1.2.3.4', 'salt')).toBe(hashIp('1.2.3.4', 'salt'));
  });

  it('throws on empty ip', () => {
    expect(() => hashIp('', 'salt')).toThrow(/ip required/);
  });

  it('throws on empty salt', () => {
    expect(() => hashIp('1.2.3.4', '')).toThrow(/salt required/);
  });
});
