import { importPKCS8, importSPKI, exportJWK, type KeyObject } from 'jose';
import { OAUTH_JWT_ALG, OAUTH_JWT_KID } from './config';

type CryptoKeyLike = Awaited<ReturnType<typeof importPKCS8>>;

let cachedPrivateKey: CryptoKeyLike | undefined;
let cachedPublicKey: CryptoKeyLike | undefined;

function decodeBase64Pem(envVar: string, name: string): string {
  const raw = process.env[envVar];
  if (!raw) {
    throw new Error(`${envVar} not set`);
  }
  // Allow either base64 (single line, more env-friendly) or raw PEM.
  if (raw.includes('BEGIN')) return raw;
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    if (!decoded.includes('BEGIN')) {
      throw new Error(`${name} did not decode to PEM`);
    }
    return decoded;
  } catch (err) {
    throw new Error(
      `${envVar} could not be parsed as base64-encoded PEM: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export async function getPrivateKey(): Promise<CryptoKeyLike> {
  if (cachedPrivateKey) return cachedPrivateKey;
  const pem = decodeBase64Pem(
    'MAS_ADVISOR_OAUTH_JWT_PRIVATE_KEY',
    'OAuth private key',
  );
  cachedPrivateKey = await importPKCS8(pem, OAUTH_JWT_ALG);
  return cachedPrivateKey;
}

export async function getPublicKey(): Promise<CryptoKeyLike> {
  if (cachedPublicKey) return cachedPublicKey;
  const pem = decodeBase64Pem(
    'MAS_ADVISOR_OAUTH_JWT_PUBLIC_KEY',
    'OAuth public key',
  );
  cachedPublicKey = await importSPKI(pem, OAUTH_JWT_ALG);
  return cachedPublicKey;
}

export async function getJwks(): Promise<{
  keys: Array<Record<string, unknown>>;
}> {
  const pub = await getPublicKey();
  const jwk = await exportJWK(pub as unknown as KeyObject);
  return {
    keys: [
      {
        ...jwk,
        use: 'sig',
        alg: OAUTH_JWT_ALG,
        kid: OAUTH_JWT_KID,
      },
    ],
  };
}

/** For tests: reset key caches. */
export function _resetKeyCache(): void {
  cachedPrivateKey = undefined;
  cachedPublicKey = undefined;
}
