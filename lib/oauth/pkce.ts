import { createHash } from 'node:crypto';

/**
 * PKCE verifier check (S256 method).
 *
 * Per RFC 7636, the client picks a high-entropy `code_verifier`, derives a
 * `code_challenge` = BASE64URL(SHA256(verifier)), and submits the challenge
 * at /authorize. At /token, the client submits the verifier. The server
 * recomputes the challenge from the verifier and compares.
 *
 * S256 is the only accepted method (we reject `plain` per OAuth 2.1).
 */
export function verifyPkceS256(
  verifier: string,
  challenge: string,
): boolean {
  const recomputed = createHash('sha256')
    .update(verifier, 'utf8')
    .digest('base64url');
  // Constant-time compare not strictly required for PKCE — the verifier is
  // sent over TLS and the challenge is a one-shot value — but cheap so do it.
  if (recomputed.length !== challenge.length) return false;
  let diff = 0;
  for (let i = 0; i < recomputed.length; i += 1) {
    diff |= recomputed.charCodeAt(i) ^ challenge.charCodeAt(i);
  }
  return diff === 0;
}
