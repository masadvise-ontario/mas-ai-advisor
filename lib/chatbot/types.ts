// Narrow query interface used by the chatbot helpers. Both `pg.Pool` and
// `pg.PoolClient` structurally satisfy this (their `query(text, params?)`
// overload matches), and so do test mocks that don't try to model pg's
// full overload surface.
export interface ChatbotDb {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rowCount: number | null; rows: R[] }>;
}
