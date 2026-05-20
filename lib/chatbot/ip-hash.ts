import { createHash } from 'node:crypto';

export function hashIp(ip: string, salt: string): string {
  if (!ip) throw new Error('ip required');
  if (!salt) throw new Error('salt required');
  return createHash('sha256').update(salt).update(':').update(ip).digest('hex');
}
