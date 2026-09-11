import type { DatabaseSync } from 'node:sqlite'
import { listMigrations } from './migrations'

/**
 * Apply drizzle-kit generated migrations idempotently, tracking applied ids in a
 * bookkeeping table so startup stays fast and re-runnable.
 */
export function migrateToLatest(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS __migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `)
  const applied = new Set<string>(
    (db.prepare('SELECT id FROM __migrations').all() as { id: string }[]).map((r) => r.id)
  )
  const insert = db.prepare('INSERT INTO __migrations (id, applied_at) VALUES (?, ?)')

  for (const m of listMigrations()) {
    if (applied.has(m.id)) continue
    db.exec('BEGIN')
    try {
      for (const statement of m.statements) db.exec(statement)
      insert.run(m.id, Date.now())
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
}
