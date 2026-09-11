import { DatabaseSync } from 'node:sqlite'

export type SqlMethod = 'run' | 'all' | 'values' | 'get'

/**
 * Adapter between Drizzle's async `sqlite-proxy` driver and Node's built-in
 * synchronous SQLite (`node:sqlite`, compiled into Electron). No native module
 * compilation is required.
 */
export interface NodeSqlite {
  /** Raw handle used for migrations / PRAGMA / multi-statement exec. */
  sync: DatabaseSync
  /** Callback consumed by `drizzle-orm/sqlite-proxy`. */
  remote: (sql: string, params: unknown[], method: SqlMethod) => Promise<{ rows: unknown[] }>
}

export function openNodeSqlite(file: string): NodeSqlite {
  const sync = new DatabaseSync(file)
  sync.exec('PRAGMA journal_mode = WAL')
  sync.exec('PRAGMA foreign_keys = ON')

  type SqlValue = string | number | bigint | Uint8Array | null
  const remote = async (
    sql: string,
    params: unknown[],
    method: SqlMethod
  ): Promise<{ rows: unknown[] }> => {
    const safe: SqlValue[] = params.map((p) => {
      if (p === undefined) return null
      const t = typeof p
      if (p === null || t === 'string' || t === 'number' || t === 'bigint') return p as SqlValue
      if (p instanceof Uint8Array) return p
      if (t === 'boolean') return p ? 1 : 0
      return String(p)
    })
    // Drizzle's sqlite-proxy maps rows positionally (mapResultRow reads
    // `row[columnIndex]`), so every row must be an ARRAY of values in the SQL
    // SELECT order — never a keyed object. node:sqlite returns keyed objects, so
    // we unwrap to arrays via Object.values (key order == column order).
    const stmt = sync.prepare(sql)

    switch (method) {
      case 'all':
        return { rows: (stmt.all(...safe) as Record<string, unknown>[]).map((r) => Object.values(r)) }
      case 'values':
        return { rows: (stmt.all(...safe) as Record<string, unknown>[]).map((r) => Object.values(r)) }
      case 'get': {
        const row = stmt.get(...safe) as Record<string, unknown> | undefined
        return { rows: (row === undefined ? undefined : Object.values(row)) as unknown as unknown[] }
      }
      case 'run':
        stmt.run(...safe)
        return { rows: [] }
    }
  }

  return { sync, remote }
}
