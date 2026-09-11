import { parseQuery } from '../search/parseQuery'
import { searchFromSpec } from '../search/pipeline'
import { enrichCompany, analyzeCompany } from './intelligenceService'
import { createList, addCompaniesToList } from '../data/listRepo'
import type { SearchSource } from '@shared/types'

export type LogFn = (line: string) => void

export interface AutopilotSummary {
  ok: boolean
  task: string
  log: string[]
  errors: string[]
  companiesFound: number
  companiesEnriched: number
  companiesAnalyzed: number
  listId?: number
  listName?: string
  sources: SearchSource[]
}

const DEFAULT_ENRICH = 10
const DEFAULT_ANALYZE = 10

function trimTask(task: string): string {
  return task.length > 60 ? `${task.slice(0, 57)}…` : task
}

/**
 * Autopilot: Sniffer takes the lead. Given a plain-English goal it
 *  1. parses the goal into a search spec,
 *  2. picks a data source itself — including auto-finding an Apify actor from the
 *     Apify store when an Apify key is connected but no actor is configured,
 *  3. searches, saves everything to a new list,
 *  4. enriches decision-makers, then
 *  5. runs AI analysis — all using whatever keys/gateways are connected.
 */
export async function runAutopilot(
  task: string,
  opts: { topEnrich?: number; topAnalyze?: number; onLog?: LogFn } = {}
): Promise<AutopilotSummary> {
  const topEnrich = opts.topEnrich ?? DEFAULT_ENRICH
  const topAnalyze = opts.topAnalyze ?? DEFAULT_ANALYZE
  const log: string[] = []
  const errors: string[] = []
  const say = (line: string): void => {
    log.push(line)
    opts.onLog?.(line)
  }

  say(`Autopilot: ${trimTask(task)}`)

  // 1) Understand the goal.
  let companies
  let metaSources: SearchSource[] = []
  let spec
  try {
    spec = await parseQuery(task)
  } catch (err) {
    errors.push(`Could not understand the goal: ${err instanceof Error ? err.message : String(err)}`)
    return { ok: false, task, log, errors, companiesFound: 0, companiesEnriched: 0, companiesAnalyzed: 0, sources: [] }
  }
  say(`Understood: ${[spec.industries.join(', '), spec.locations.join(', '), spec.signals.join(', ')].filter(Boolean).join(' — ') || spec.description || 'general search'}`)

  // 2) Search. Source selection (including auto-discovering an Apify actor on
  //    demand) happens inside searchFromSpec — no manual actor needed.

  // 3) Run the search through whatever sources are now available.
  try {
    const outcome = await searchFromSpec(spec, { skipHistory: true })
    companies = outcome.companies
    metaSources = outcome.meta.providers
    const sourceNames = metaSources.map((s) => s.name).join(', ') || 'none'
    say(`Searched via: ${sourceNames} — ${companies.length} match${companies.length === 1 ? '' : 'es'}.`)
    for (const n of outcome.meta.notes) say(`  note: ${n}`)
  } catch (err) {
    errors.push(`Search failed: ${err instanceof Error ? err.message : String(err)}`)
    return { ok: false, task, log, errors, companiesFound: 0, companiesEnriched: 0, companiesAnalyzed: 0, sources: metaSources }
  }

  if (companies.length === 0) {
    const msg = 'No companies found. Connect a data provider (Apollo/Apify key) or an AI gateway, or enable demo fallback in Settings.'
    errors.push(msg)
    say(msg)
    return { ok: false, task, log, errors, companiesFound: 0, companiesEnriched: 0, companiesAnalyzed: 0, sources: metaSources }
  }

  // 4) Save everything to a fresh list.
  let listId: number | undefined
  let listName: string | undefined
  try {
    listName = `Autopilot · ${trimTask(task)}`
    const list = await createList(listName, 'Created automatically by Autopilot.')
    const ids = companies.map((c) => c.id).slice(0, 60)
    const added = await addCompaniesToList(list.id, ids)
    listId = list.id
    say(`Saved ${added} prospect${added === 1 ? '' : 's'} to list “${listName}”.`)
  } catch (err) {
    errors.push(`Could not save to a list: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 5) Enrich decision-makers (uses whatever enrichment is connected).
  let enriched = 0
  for (const c of companies.slice(0, topEnrich)) {
    try {
      await enrichCompany(c.id)
      enriched++
    } catch (err) {
      errors.push(`Enrich ${c.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  say(`Enriched ${enriched} company${enriched === 1 ? '' : 'ies'}.`)

  // 6) AI analysis.
  let analyzed = 0
  for (const c of companies.slice(0, topAnalyze)) {
    try {
      await analyzeCompany(c.id)
      analyzed++
    } catch (err) {
      errors.push(`Analyze ${c.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  say(`Analyzed ${analyzed} company${analyzed === 1 ? '' : 'ies'}.`)

  say('Autopilot run finished.')
  return {
    ok: true,
    task,
    log,
    errors,
    companiesFound: companies.length,
    companiesEnriched: enriched,
    companiesAnalyzed: analyzed,
    listId,
    listName,
    sources: metaSources
  }
}
