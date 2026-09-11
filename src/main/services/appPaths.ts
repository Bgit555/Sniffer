import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

let cached: AppDirs | null = null

export interface AppDirs {
  root: string
  dbFile: string
  logs: string
  exports: string
  cache: string
  backups: string
}

/** Resolve (and create) the application data directories under %APPDATA%\Sniffer. */
export function appDirs(): AppDirs {
  if (cached) return cached
  const root = app.getPath('userData')
  const dirs: AppDirs = {
    root,
    dbFile: join(root, 'sniffer.db'),
    logs: join(root, 'logs'),
    exports: join(root, 'exports'),
    cache: join(root, 'cache'),
    backups: join(root, 'backups')
  }
  for (const d of [dirs.logs, dirs.exports, dirs.cache, dirs.backups]) {
    mkdirSync(d, { recursive: true })
  }
  cached = dirs
  return dirs
}
