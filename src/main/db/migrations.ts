import { app } from 'electron'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'

export interface Migration {
  id: string
  statements: string[]
}

/** Folder containing drizzle-kit generated `NNNN_*.sql` migration files. */
function migrationFolder(): string {
  // Packaged: SQL is shipped under resources via electron-builder extraResources.
  // Development: the project root owns the `drizzle/` folder.
  return app.isPackaged ? join(process.resourcesPath, 'drizzle') : join(app.getAppPath(), 'drizzle')
}

/** Read every migration file in ascending order (NNNN prefix sorts naturally). */
export function listMigrations(): Migration[] {
  const folder = migrationFolder()
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({
      id: f.replace(/\.sql$/, ''),
      // A generated file may contain several statements; exec handles all of them.
      statements: [readFileSync(join(folder, f), 'utf-8')]
    }))
}
