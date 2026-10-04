// Applies db/NNN_*.sql in order, each in its own transaction, and records what ran.
//   node --env-file=.env.local scripts/migrate.ts          apply pending migrations
//   node --env-file=.env.local scripts/migrate.ts --reset  drop everything and rebuild (dev only)
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'db')
const reset = process.argv.includes('--reset')

if (reset && process.env.NODE_ENV === 'production') {
  console.error('Refusing to --reset with NODE_ENV=production')
  process.exit(1)
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

try {
  if (reset) {
    console.log('Dropping all tables …')
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  }
  await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
  const done = new Set(
    (await client.query<{ name: string }>('SELECT name FROM public.schema_migrations')).rows.map((r) => r.name),
  )
  const files = readdirSync(dir).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort()
  let applied = 0
  for (const f of files) {
    if (done.has(f)) continue
    const sql = readFileSync(join(dir, f), 'utf8')
    process.stdout.write(`  ${f} … `)
    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query('INSERT INTO public.schema_migrations (name) VALUES ($1)', [f])
      await client.query('COMMIT')
      applied++
      console.log('ok')
    } catch (err) {
      await client.query('ROLLBACK')
      console.log('FAILED')
      throw err
    }
  }
  console.log(applied ? `Applied ${applied} migration(s).` : 'Database is up to date.')
} catch (err) {
  const e = err as { message?: string; position?: string; where?: string }
  console.error('\nMigration error:', e.message, e.position ? `(at char ${e.position})` : '', e.where ?? '')
  process.exitCode = 1
} finally {
  await client.end()
}
