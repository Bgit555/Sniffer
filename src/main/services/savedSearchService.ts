import { desc, eq } from 'drizzle-orm'
import { getDb, lastInsertRowid } from '../db'
import { savedSearches } from '../db/schema'
import { searchFromSpec } from '../search/pipeline'
import { parseQuery } from '../search/parseQuery'
import { EMPTY_SEARCH_SPEC, type CompanyView, type SearchSpec } from '@shared/types'

const now = () => Date.now()

export interface SavedSearchView {
  id: number
  name: string
  query: string
  enabled: boolean
  lastRunAt: number | null
  lastResultCount: number
  lastNewMatches: number
  lastNewSignals: number
  createdAt: number
}

function toView(row: typeof savedSearches.$inferSelect): SavedSearchView {
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    enabled: (row.enabled ?? 1) === 1,
    lastRunAt: row.lastRunAt ?? null,
    lastResultCount: row.lastResultCount ?? 0,
    lastNewMatches: row.lastNewMatches ?? 0,
    lastNewSignals: row.lastNewSignals ?? 0,
    createdAt: row.createdAt ?? 0
  }
}

function parseSpec(row: typeof savedSearches.$inferSelect): SearchSpec {
  if (row.specJson) {
    try {
      const s = JSON.parse(row.specJson) as SearchSpec
      if (s && typeof s === 'object') return { ...EMPTY_SEARCH_SPEC, ...s }
    } catch {
      /* fall through */
    }
  }
  return { ...EMPTY_SEARCH_SPEC, description: row.query }
}

export async function listSavedSearches(): Promise<SavedSearchView[]> {
  const db = getDb()
  const rows = await db.select().from(savedSearches).orderBy(desc(savedSearches.createdAt)).all()
  return rows.map(toView)
}

export async function createSavedSearch(name: string, query: string): Promise<SavedSearchView> {
  const spec = await parseQuery(query) // persist the parsed spec for deterministic re-runs
  const db = getDb()
  await db
    .insert(savedSearches)
    .values({ name, query, specJson: JSON.stringify(spec), enabled: 1, createdAt: now() })
    .run()
  const id = lastInsertRowid()
  const row = await db.select().from(savedSearches).where(eq(savedSearches.id, id)).get()
  return toView(row!)
}

export async function deleteSavedSearch(id: number): Promise<void> {
  const db = getDb()
  await db.delete(savedSearches).where(eq(savedSearches.id, id)).run()
}

export async function setSavedSearchEnabled(id: number, enabled: boolean): Promise<void> {
  const db = getDb()
  await db.update(savedSearches).set({ enabled: enabled ? 1 : 0 }).where(eq(savedSearches.id, id)).run()
}

interface Snapshot {
  domains: string[]
  signals: Record<string, string[]>
}

/** Re-run a saved search and measure new matches + new signals since last run. */
export async function runSavedSearch(id: number): Promise<{ view: SavedSearchView; companies: CompanyView[] }> {
  const db = getDb()
  const row = await db.select().from(savedSearches).where(eq(savedSearches.id, id)).get()
  if (!row) throw new Error('Saved search not found.')

  const outcome = await searchFromSpec(parseSpec(row), { skipHistory: true })
  const companies = outcome.companies

  let prev: Snapshot = { domains: [], signals: {} }
  if (row.lastResultDomains) {
    try {
      prev = JSON.parse(row.lastResultDomains) as Snapshot
    } catch {
      prev = { domains: [], signals: {} }
    }
  }
  const prevDomains = new Set(prev.domains.map((d) => d.toLowerCase()))

  const domains: string[] = []
  const signals: Record<string, string[]> = {}
  let newMatches = 0
  let newSignals = 0

  for (const c of companies) {
    const key = (c.domain ?? c.name).toLowerCase()
    domains.push(key)
    const types = c.signals.map((s) => s.type)
    signals[key] = types
    if (!prevDomains.has(key)) {
      newMatches++
      newSignals += types.length // all signals on a brand-new company are new
    } else {
      const had = new Set(prev.signals[key] ?? [])
      newSignals += types.filter((t) => !had.has(t)).length
    }
  }

  const snapshot: Snapshot = { domains, signals }
  await db
    .update(savedSearches)
    .set({
      lastRunAt: now(),
      lastResultCount: companies.length,
      lastNewMatches: newMatches,
      lastNewSignals: newSignals,
      lastResultDomains: JSON.stringify(snapshot)
    })
    .where(eq(savedSearches.id, id))
    .run()

  const updated = await db.select().from(savedSearches).where(eq(savedSearches.id, id)).get()
  return { view: toView(updated!), companies }
}
