import type { NormalizedCompany, NormalizedPerson, SearchSpec } from '@shared/types'

const BASE = 'https://app.apollo.io/api/v1'

// Apollo's available endpoints vary by plan/version. Try them in order and fall
// through any that don't exist (404/405) or reject our shape (400).
const COMPANY_PATHS = ['/mixed_companies/search', '/organizations/search', '/mixed_people/api_search']
const PEOPLE_PATHS = [
  '/mixed_people/api_search',
  '/mixed_people/search',
  '/people/search',
  '/people/match',
  '/people/bulk_match',
  '/people/show'
]

/**
 * Apollo.io REST adapter. Experimental: the exact contract is defensive because
 * Apollo's API evolves. Any error is thrown so the router can degrade to the
 * demo provider and surface a note. Requires an Apollo account + API key.
 */
/**
 * POST against a list of candidate endpoints, falling through 404/405 to the
 * next one (Apollo's endpoint set varies by plan/version). Non-404 errors throw
 * immediately so a bad key is surfaced, not masked by fallback.
 */
async function apolloFetchAny(paths: string[], apiKey: string, body: unknown): Promise<unknown> {
  let lastStatus = 0
  for (const path of paths) {
    const resp = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'cache-control': 'no-cache' },
      body: JSON.stringify(body)
    })
    if (resp.ok) return resp.json()
    lastStatus = resp.status
    // Fall through "not usable" statuses to the next (lower-tier/free) endpoint.
    // Only a 401 is a hard auth failure.
    if (resp.status === 404 || resp.status === 405 || resp.status === 400 || resp.status === 402 || resp.status === 403 || resp.status >= 500) {
      continue
    }
    const raw = await resp.text()
    let msg = raw
    try {
      msg = JSON.parse(raw)?.message || raw
    } catch {
      /* raw body */
    }
    throw new Error(`Apollo HTTP ${resp.status}: ${String(msg).slice(0, 200)}`)
  }
  throw new Error(`Apollo endpoint unavailable (HTTP ${lastStatus}). Tried: ${paths.join(', ')}`)
}

/** Validate an Apollo API key with a minimal (per_page=1) real search. */
export async function apolloTest(apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const body = JSON.stringify({ page: 1, per_page: 1, q_keywords: 'test' })
    for (const path of COMPANY_PATHS) {
      const resp = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'cache-control': 'no-cache' },
        body
      })
      if (resp.ok) return { ok: true, message: `Apollo key valid (via ${path}).` }
      if (resp.status === 401 || resp.status === 403) return { ok: false, message: `Apollo key rejected (HTTP ${resp.status}).` }
      if (resp.status === 402) return { ok: false, message: 'Apollo key valid but no search credits (HTTP 402).' }
      if (resp.status === 404 || resp.status === 405 || resp.status === 400) continue
      return { ok: false, message: `Apollo returned HTTP ${resp.status}.` }
    }
    return { ok: false, message: 'Apollo search endpoints unavailable (404/400 on all candidates).' }
  } catch (err) {
    return { ok: false, message: `Apollo unreachable: ${err instanceof Error ? err.message : String(err)}` }
  }
}

function numRanges(min?: number, max?: number): unknown[] | undefined {
  if (min === undefined && max === undefined) return undefined
  return [[{ min: min ?? 1, max: max ?? 1000000 }]]
}

function locationList(locations: string[]): string[] | undefined {
  const norm = locations.map((l) => l.trim()).filter(Boolean)
  return norm.length ? norm : undefined
}

export async function apolloSearchCompanies(spec: SearchSpec, apiKey: string, limit = 25): Promise<NormalizedCompany[]> {
  const body: Record<string, unknown> = {
    page: 1,
    per_page: Math.min(limit, 100),
    q_keywords: spec.keywords.join(' ') || undefined,
    organization_locations: locationList(spec.locations),
    organization_num_employees_ranges: numRanges(spec.employeeMin, spec.employeeMax),
    person_titles: spec.titles.length ? spec.titles : undefined
  }

  const data = (await apolloFetchAny(COMPANY_PATHS, apiKey, body)) as Record<string, unknown>
  const orgs = extractOrganizations(data)
  return orgs.map(normalizeOrg).slice(0, limit)
}

export async function apolloFindPeople(spec: SearchSpec, apiKey: string, limit = 25): Promise<NormalizedPerson[]> {
  const body: Record<string, unknown> = {
    page: 1,
    per_page: Math.min(limit, 100),
    q_keywords: spec.keywords.join(' ') || undefined,
    person_locations: locationList(spec.locations),
    person_titles: spec.titles.length ? spec.titles : undefined,
    organization_num_employees_ranges: numRanges(spec.employeeMin, spec.employeeMax)
  }
  const data = (await apolloFetchAny(PEOPLE_PATHS, apiKey, body)) as Record<string, unknown>
  return extractPeople(data).map(normalizePerson).slice(0, limit)
}

export async function apolloEnrichPeople(domain: string, apiKey: string, limit = 12): Promise<NormalizedPerson[]> {
  const data = (await apolloFetchAny(PEOPLE_PATHS, apiKey, {
    page: 1,
    per_page: limit,
    q_organization_domains: domain
  })) as Record<string, unknown>
  return extractPeople(data).map(normalizePerson).slice(0, limit)
}

function extractOrganizations(data: Record<string, unknown>): Record<string, unknown>[] {
  const root = unwrap(data)
  const orgs = root.organizations ?? root.accounts ?? root.companies ?? []
  return Array.isArray(orgs) ? (orgs as Record<string, unknown>[]) : []
}

function extractPeople(data: Record<string, unknown>): Record<string, unknown>[] {
  const root = unwrap(data)
  const p = root.people ?? root.contacts ?? []
  return Array.isArray(p) ? (p as Record<string, unknown>[]) : []
}

function unwrap(data: Record<string, unknown>): Record<string, unknown> {
  const inner = data.data ?? data
  return typeof inner === 'object' && inner !== null ? (inner as Record<string, unknown>) : {}
}

function normalizeOrg(o: Record<string, unknown>): NormalizedCompany {
  const org = (o.organization && typeof o.organization === 'object' ? o.organization : o) as Record<string, unknown>
  return {
    provider: 'apollo-search',
    providerRecordId: org.id ? String(org.id) : undefined,
    name: String(org.name ?? ''),
    domain: org.primary_domain ? String(org.primary_domain) : null,
    website: org.website_url ? String(org.website_url) : null,
    description: org.short_description ? String(org.short_description) : null,
    industry: org.primary_industry ? String(org.primary_industry) : null,
    employeeCount: typeof org.employee_count === 'number' ? org.employee_count : null,
    country: org.country ? String(org.country) : null,
    city: org.city ? String(org.city) : null,
    linkedinUrl: org.linkedin_url ? String(org.linkedin_url) : null,
    logoUrl: org.logo_url ? String(org.logo_url) : null,
    dataConfidence: 0.85
  }
}

function normalizePerson(p: Record<string, unknown>): NormalizedPerson {
  const person = (p.person && typeof p.person === 'object' ? p.person : p) as Record<string, unknown>
  const org = p.organization as Record<string, unknown> | undefined
  return {
    provider: 'apollo-enrich',
    providerRecordId: person.id ? String(person.id) : undefined,
    firstName: person.first_name ? String(person.first_name) : null,
    lastName: person.last_name ? String(person.last_name) : null,
    title: person.title ? String(person.title) : null,
    companyName: org?.name ? String(org.name) : undefined,
    email: person.email ? String(person.email) : null,
    emailStatus: person.email_status ? String(person.email_status) : null,
    linkedinUrl: person.linkedin_url ? String(person.linkedin_url) : null,
    location: [person.city, person.state, person.country].filter(Boolean).join(', ') || null
  }
}
