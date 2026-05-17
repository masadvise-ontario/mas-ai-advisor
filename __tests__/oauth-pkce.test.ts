import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { verifyPkceS256 } from '@/lib/oauth/pkce';

function makeVerifierAndChallenge(): {
  verifier: string;
  challenge: string;
} {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256')
    .update(verifier, 'utf8')
    .digest('base64url');
  return { verifier, challenge };
}

describe('verifyPkceS256', () => {
  it('accepts a matching verifier+challenge pair', () => {
    const { verifier, challenge } = makeVerifierAndChallenge();
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
  });

  it('rejects a non-matching verifier', () => {
    const { challenge } = makeVerifierAndChallenge();
    const wrongVerifier = randomBytes(32).toString('base64url');
    expect(verifyPkceS256(wrongVerifier, challenge)).toBe(false);
  });

  it('rejects when challenge length differs', () => {
    const { verifier } = makeVerifierAndChallenge();
    expect(verifyPkceS256(verifier, 'short')).toBe(false);
  });

  it('rejects empty verifier against a real challenge', () => {
    const { challenge } = makeVerifierAndChallenge();
    expect(verifyPkceS256('', challenge)).toBe(false);
  });
});
