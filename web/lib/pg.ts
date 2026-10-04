// Shared Postgres plumbing for the app and the command-line scripts.
// No Next.js imports here, so seed/integrity scripts can run it directly in Node.
import pg from 'pg'

// int8 (ids, counts) → number: ids never approach 2^53.
pg.types.setTypeParser(20, (v: string) => parseInt(v, 10))
// DATE → 'YYYY-MM-DD' string, never a JS Date (no timezone drift in Dubai or anywhere else)
pg.types.setTypeParser(1082, (v: string) => v)
// timestamps → ISO-ish strings (serialisable across the server/client boundary)
pg.types.setTypeParser(1114, (v: string) => v)
pg.types.setTypeParser(1184, (v: string) => v)
// NUMERIC stays a string (1700) — money is parsed by lib/dec, never by parseFloat.

export type Db = pg.Pool | pg.PoolClient | pg.Client
export type Row = Record<string, unknown>

export function makePool(): pg.Pool {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 12,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 30_000,
  })
  pool.on('error', (err) => console.error('[db] idle client error', err.message))
  return pool
}

export async function rows<T = Row>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query(sql, params)).rows as T[]
}

export async function one<T = Row>(db: Db, sql: string, params: unknown[] = []): Promise<T> {
  const r = (await db.query(sql, params)).rows
  if (r.length === 0) throw new DomainError('Record not found')
  return r[0] as T
}

export async function maybe<T = Row>(db: Db, sql: string, params: unknown[] = []): Promise<T | null> {
  const r = (await db.query(sql, params)).rows
  return (r[0] as T) ?? null
}

export async function scalar<T = unknown>(db: Db, sql: string, params: unknown[] = []): Promise<T> {
  const r = (await db.query(sql, params)).rows[0]
  return (r ? Object.values(r)[0] : null) as T
}

export async function inTx<T>(pool: pg.Pool, fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    const out = await fn(c)
    await c.query('COMMIT')
    return out
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    c.release()
  }
}

/** A rule the business logic enforces; its message is safe to show the user. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainError'
  }
}

/** Turn any error into a message safe for the screen. */
export function errorMessage(err: unknown): string {
  if (err instanceof DomainError) return err.message
  const e = (err ?? {}) as { code?: string; message?: string; constraint?: string }
  if (e.code === 'P0001' && e.message) return e.message.split('\n')[0].slice(0, 300)
  switch (e.code) {
    case '23505': return 'That reference already exists — a record with the same number is present.'
    case '23514': return `That value is not allowed${e.constraint ? ` (${e.constraint.replace(/_/g, ' ')})` : ''}.`
    case '23503': return 'A related record is missing, or this record is still used elsewhere.'
    case '23P01': return 'That overlaps an existing entry for the same period.'
    case '23502': return 'A required field is missing.'
    case '22003': case '22P02': case '22007': case '22008': return 'Invalid input — check the values entered.'
    case '40001': case '40P01': case '55P03': return 'The system was busy — please try again.'
  }
  console.error('[error]', e.code, e.message)
  return 'Something went wrong. Please try again.'
}
