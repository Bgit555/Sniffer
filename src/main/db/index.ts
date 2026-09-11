import type { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import * as schema from './schema'
import { openNodeSqlite, type NodeSqlite } from './adapter'
import { appDirs } from '../services/appPaths'
import { migrateToLatest } from './migrate'

export type SnifferDb = ReturnType<typeof drizzle<typeof schema>>

let handle: NodeSqlite | null = null
let db: SnifferDb | null = null

/** Initialise the local SQLite database and apply migrations. Safe to call once. */
export function initDb(): SnifferDb {
  if (db) return db
  const { dbFile } = appDirs()
  handle = openNodeSqlite(dbFile)
  migrateToLatest(handle.sync)
  db = drizzle(handle.remote, { schema }) as SnifferDb
  return db
}

export function getDb(): SnifferDb {
  return db ?? initDb()
}

/** Raw node:sqlite handle — used only for PRAGMA / exec where the ORM is awkward. */
export function getSyncDb(): DatabaseSync {
  if (!handle) initDb()
  return handle!.sync
}

/**
 * Row id of the most recent INSERT. Called synchronously straight after an
 * awaited Drizzle insert on the same connection, so it always refers to that
 * insert (the proxy driver drops `.returning()` rows, so this is the source of
 * truth for generated ids).
 */
export function lastInsertRowid(): number {
  const row = getSyncDb().prepare('SELECT last_insert_rowid() AS id').get() as { id: number }
  return row.id
}

export { schema }
