import { EMPTY_SEARCH_SPEC, SearchSpecSchema, type SearchSpec } from '@shared/types'
import { isAiConfigured, structured } from '../ai/router'

const LOCATION_WORDS: [string, string][] = [
  ['united states', 'United States'],
  ['united kingdom', 'United Kingdom'],
  ['us', 'United States'],
  ['usa', 'United States'],
  ['canada', 'Canada'],
  ['uk', 'United Kingdom'],
  ['germany', 'Germany'],
  ['france', 'France'],
  ['australia', 'Australia'],
  ['india', 'India']
]

const INDUSTRY_WORDS = [
  'saas',
  'software',
  'fintech',
  'cybersecurity',
  'security',
  'developer tools',
  'devtools',
  'infrastructure',
  'ai',
  'machine learning',
  'healthtech',
  'healthcare',
  'regtech',
  'ecommerce',
  'e-commerce',
  'climate',
  'analytics',
  'data'
]

const SIGNAL_WORDS: [string, string[]][] = [
  ['recent_funding', ['raised', 'funding', 'seed', 'series a', 'series b', 'series c']],
  ['hiring', ['hiring', 'recruiting', 'recruit']],
  ['marketing_hiring', ['hiring marketing', 'marketing leader', 'head of marketing', 'cmo']],
  ['sales_hiring', ['hiring sales', 'account executives']],
  ['expansion', ['expansion', 'expanding', 'new office', 'new location']],
  ['product', ['launched', 'launch', 'released']],
  ['leadership', ['new ceo', 'new cro', 'new ciso', 'leadership change']]
]

const TITLE_WORDS = [
  'marketing',
  'sales',
  'growth',
  'engineering',
  'product',
  'cmo',
  'cro',
  'founder',
  'ceo'
]

const AI_SYSTEM = `You convert a natural-language prospecting request into a strict JSON search specification. Respond with ONLY valid JSON (no markdown, no commentary). The object has these fields:
- "entity": "company" or "person"
- "locations": array of country/city names (e.g. ["United States"])
- "industries": array of industry terms (e.g. ["SaaS"])
- "employeeMin": number or omit
- "employeeMax": number or omit
- "keywords": short phrases that should appear in descriptions
- "signals": array from this list or similar: recent_funding, hiring, marketing_hiring, sales_hiring, expansion, product, leadership
- "titles": array of decision-maker job titles the user mentions (e.g. ["VP Marketing"])
- "description": the user's full original request

When in doubt, use your best inference. Keep arrays to the most important 3-4 items.`

function includesWord(haystack: string, word: string): boolean {
  return haystack.includes(word) || new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(haystack)
}

/** Offline fallback so search still works before any AI gateway is configured. */
export function heuristicParse(query: string): SearchSpec {
  const q = query.toLowerCase()
  const spec: SearchSpec = { ...EMPTY_SEARCH_SPEC, description: query }

  for (const [word, label] of LOCATION_WORDS) {
    if (includesWord(q, word)) spec.locations.push(label)
  }

  for (const ind of INDUSTRY_WORDS) {
    if (includesWord(q, ind)) {
      const pretty = ind
        .split(' ')
        .map((w) => w[0]?.toUpperCase() + w.slice(1))
        .join(' ')
      spec.industries.push(pretty)
    }
  }

  // Employee ranges like "20-200 employees", "under 50", "over 1000".
  const range = q.match(/(\d+)\s*[-–—to]+\s*(\d+)(?:\s*employees?)?/)
  if (range) {
    spec.employeeMin = Number(range[1])
    spec.employeeMax = Number(range[2])
  } else {
    const under = q.match(/under\s+(\d+)|less than\s+(\d+)|<(\d+)/)
    if (under) {
      const n = Number(under[1] ?? under[2] ?? under[3])
      spec.employeeMax = n
    }
    const over = q.match(/(\d+)\s*\+?\s*(?:employees?|people|staff)|over\s+(\d+)|>(\d+)/)
    if (over) spec.employeeMin = Number(over[1] ?? over[2] ?? over[3])
  }

  for (const [type, words] of SIGNAL_WORDS) {
    if (words.some((w) => includesWord(q, w))) spec.signals.push(type)
  }

  for (const t of TITLE_WORDS) {
    if (includesWord(q, ` ${t}`)) {
      const m = q.match(new RegExp(`(?:vp|vice president|head|director|chief)\\s+(?:of\\s+)?${t}`))
      if (m) {
        const label = m[0].replace(/\b(vp|vice president)\b/i, 'VP').replace(/^./, (c) => c.toUpperCase())
        if (!spec.titles.includes(label)) spec.titles.push(label)
      }
    }
  }

  if (/(people|contacts?|founders?|executives?|leaders?)\b/.test(q)) {
    spec.entity = 'person'
  }

  return spec
}

/** Parse a natural-language request into a structured search spec (AI first). */
export async function parseQuery(query: string): Promise<SearchSpec> {
  const trimmed = query.trim()
  if (!trimmed) throw new Error('Please describe the prospects you want to find.')
  if (isAiConfigured()) {
    try {
      return await structured<SearchSpec>({
        feature: 'search.parse',
        purpose: 'extraction',
        system: AI_SYSTEM,
        user: trimmed,
        schema: SearchSpecSchema
      })
    } catch (err) {
      // AI unreachable or misconfigured → degrade gracefully to the offline parser.
      console.warn('[search] AI parse failed, using heuristic fallback:', err)
    }
  }
  return heuristicParse(trimmed)
}
