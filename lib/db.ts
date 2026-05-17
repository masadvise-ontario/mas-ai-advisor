import { Pool } from 'pg';

let _pool: Pool | undefined;

export function getPool(): Pool {
  if (_pool) return _pool;

  const connectionString = process.env.MAS_ADVISOR_DATABASE_URL;
  if (!connectionString) {
    throw new Error('MAS_ADVISOR_DATABASE_URL not set');
  }

  _pool = new Pool({
    connectionString,
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : undefined,
  });

  return _pool;
}

export const SCOPE = 'mas-public-advisor';
