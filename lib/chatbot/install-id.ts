import { createHash, randomUUID } from 'node:crypto';

// Fixed namespace UUID for the MAS public web advisor. Distinct from any
// pgvector / KB namespace. Hardcoded here so deterministic IDs are stable
// across deploys and not env-dependent.
const NAMESPACE = '7b4f3c12-9a82-4e1f-8d7a-5b6c1e2f3a4b';

function namespaceBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

// RFC 4122 v5 UUID derived from email + the fixed namespace.
// Repeat submissions with the same email produce the same install_id, so
// registerInstall's ON CONFLICT (install_id) DO NOTHING keeps the install
// row stable across return visits.
export function installIdFromEmail(email: string): string {
  if (!email) throw new Error('email required');
  const normalized = email.trim().toLowerCase();
  const ns = namespaceBytes(NAMESPACE);
  const hash = createHash('sha1').update(ns).update(normalized).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex').slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

// Fresh random install_id for anonymous (no-email) sessions. Different
// every session — no cross-session correlation.
export function anonymousInstallId(): string {
  return randomUUID();
}
