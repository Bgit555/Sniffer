import type { NormalizedCompany, NormalizedPerson, SearchSpec } from '@shared/types'

const API = 'https://api.apify.com/v2'

interface ApifyCreds {
  token: string
  actorSearch: string
  actorEnrich: string
}

/** Accept a full actor page URL (apify.com/user/actor) or a bare `user~actor` id. */
export function normalizeActorId(input: string): string {
  const s = input.trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) {
    const m = s.replace(/^https?:\/\//i, '').replace(/\/+$/, '').split('/')
    // e.g. console.apify.com/actors/AbCdEf/user~actor or apify.com/user/actor
    const idx = m.findIndex((seg) => seg.includes('~'))
    if (idx >= 0 && m[idx + 1]) return m[idx]
    const last = m[m.length - 1]
    if (last.includes('~')) return last
    if (m.length >= 2) return `${m[m.length - 2]}~${m[m.length - 1]}`
  }
  return s
}

/** Validate an Apify token and return the account handle it belongs to. */
export async function apifyTest(token: string): Promise<{ ok: boolean; message: string }> {
  try {
    const resp = await fetch(`${API}/users/me?token=${token}`)
    if (!resp.ok) return { ok: false, message: `Apify token invalid (HTTP ${resp.status}).` }
    const data = (await resp.json()) as { data?: { username?: string; email?: string } }
    const who = data?.data?.username ?? data?.data?.email ?? 'account'
    return { ok: true, message: `Apify token valid — connected as ${who}.` }
  } catch (err) {
    return { ok: false, message: `Apify unreachable: ${err instanceof Error ? err.message : String(err)}` }
  }
}

async function startRun(actorId: string, token: string, input: unknown): Promise<string> {
  const id = normalizeActorId(actorId)
  if (!id) throw new Error('Apify actor id not configured (e.g. "user~actor-name").')
  const resp = await fetch(`${API}/acts/${id}/runs?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  })
  if (!resp.ok) {
    const raw = await resp.text()
    throw new Error(`Apify start failed (${resp.status}): ${raw.slice(0, 220)}`)
  }
  const data = (await resp.json()) as { data?: { id?: string } }
  const runId = data?.data?.id
  if (!runId) throw new Error('Apify did not return a run id.')
  return runId
}

async function waitForRun(runId: string, token: string, timeoutMs = 90_000): Promise<'SUCCEEDED' | 'FAILED' | 'TIMED-OUT'> {
  const start = Date.now()
  for (;;) {
    const resp = await fetch(`${API}/actor-runs/${runId}?token=${token}`)
    if (!resp.ok) throw new Error(`Apify status failed (${resp.status})`)
    const data = (await resp.json()) as { data?: { status?: string; statusMessage?: string } }
    const status = data?.data?.status
    if (status === 'SUCCEEDED') return 'SUCCEEDED'
    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      throw new Error(`Apify run ${status}${data?.data?.statusMessage ? `: ${data.data.statusMessage}` : ''}`)
    }
    if (Date.now() - start > timeoutMs) return 'TIMED-OUT'
    await new Promise((r) => setTimeout(r, 4000))
  }
}

export interface PickedActor {
  actorId: string
  title: string
  description: string
  pricingModel?: string
  isFree?: boolean
}

interface StoreItem {
  id?: string
  title?: string
  description?: string
  pricingModel?: string
  isFree?: boolean
}

function isFreeActor(it: StoreItem): boolean {
  if (it.isFree === true) return true
  if (typeof it.pricingModel === 'string') return /free/i.test(it.pricingModel)
  return false
}

function scoreActor(it: StoreItem, termsList: string[]): number {
  const hay = `${it.title ?? ''} ${it.description ?? ''}`.toLowerCase()
  let s = 0
  for (const t of termsList) if (hay.includes(t)) s++
  return s
}

/**
 * "Get the actor itself": search Apify's public actor store (a few query
 * variants) and return a scored list of candidates so Sniffer can pick the most
 * useful without the user knowing which actor to run.
 */
export async function apifySearchActors(token: string, terms: string, limit = 6): Promise<PickedActor[]> {
  const variants = [terms || 'company search']
  const termsTokens = terms.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  // Add focused variants so discovery spans more of the store.
  if (termsTokens.length > 2) variants.push(termsTokens.slice(0, 3).join(' '))
  if (/\b(finance|fintech|insurance)\b/i.test(terms)) variants.push('finance leads')
  if (/\b(dev|software|saas|tech)\b/i.test(terms)) variants.push('software companies')
  if (/\b(retail|ecommerce|shop)\b/i.test(terms)) variants.push('ecommerce stores')
  if (/\b(health|medical|clinical)\b/i.test(terms)) variants.push('healthcare')

  const seen = new Map<string, PickedActor>()
  for (const v of variants.slice(0, 3)) {
    try {
      const q = encodeURIComponent(v)
      const resp = await fetch(`${API}/store?limit=10&search=${q}&token=${token}`)
      if (!resp.ok) continue
      const data = (await resp.json()) as { data?: { items?: StoreItem[] } }
      for (const it of data?.data?.items ?? []) {
        if (!it.id || !it.title || seen.has(it.id)) continue
        seen.set(it.id, { actorId: it.id, title: it.title, description: it.description ?? '', pricingModel: it.pricingModel, isFree: it.isFree })
      }
    } catch {
      /* one variant failing shouldn't stop discovery */
    }
  }

  // Prefer free/lower-tier actors first, then most relevant.
  return [...seen.values()]
    .sort((a, b) => {
      const fa = isFreeActor(a) ? 1 : 0
      const fb = isFreeActor(b) ? 1 : 0
      if (fa !== fb) return fb - fa
      return scoreActor(b, termsTokens) - scoreActor(a, termsTokens)
    })
    .slice(0, limit)
}

export async function apifyFindActor(token: string, terms: string): Promise<PickedActor | null> {
  const list = await apifySearchActors(token, terms)
  return list[0] ?? null
}

async function fetchDataset(runId: string, token: string): Promise<Record<string, unknown>[]> {
  const resp = await fetch(`${API}/actor-runs/${runId}/dataset/items?token=${token}&format=json`)
  if (!resp.ok) throw new Error(`Apify dataset fetch failed (${resp.status})`)
  return (await resp.json()) as Record<string, unknown>[]
}

function field(item: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = item[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

function num(item: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = item[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v)
  }
  return null
}

function normalizeOrg(item: Record<string, unknown>): NormalizedCompany {
  const name = field(item, ['name', 'company', 'organization', 'title']) ?? 'Unnamed company'
  const domain = field(item, ['domain', 'website', 'primary_domain', 'companyUrl'])
  return {
    provider: 'apify',
    providerRecordId: field(item, ['id', 'linkedinUrl']) ?? undefined,
    name,
    domain,
    website: field(item, ['website', 'websiteUrl', 'companyUrl']),
    description: field(item, ['description', 'about', 'short_description']),
    industry: field(item, ['industry', 'categories']),
    employeeCount: num(item, ['employeeCount', 'employees', 'numberOfEmployees']),
    country: field(item, ['country', 'hqCountry']),
    city: field(item, ['city', 'hqCity', 'location']),
    linkedinUrl: field(item, ['linkedinUrl', 'linkedin', 'companyLinkedinUrl']),
    logoUrl: field(item, ['logoUrl', 'imageUrl']),
    dataConfidence: 0.8
  }
}

function normalizePerson(item: Record<string, unknown>): NormalizedPerson {
  const fullName = field(item, ['name', 'fullName'])
  const [firstName, ...rest] = fullName ? fullName.split(' ') : ['', '']
  return {
    provider: 'apify',
    providerRecordId: field(item, ['id', 'linkedinUrl']) ?? undefined,
    firstName: field(item, ['firstName']) ?? firstName,
    lastName: field(item, ['lastName']) ?? rest.join(' '),
    title: field(item, ['title', 'position', 'headline']),
    companyName: field(item, ['company', 'organization', 'companyName']),
    email: field(item, ['email', 'emailAddress']),
    emailStatus: null,
    linkedinUrl: field(item, ['linkedinUrl', 'profileUrl', 'url']),
    location: field(item, ['location', 'city'])
  }
}

/** Search via a user-configured Apify actor. Returns [] on timeout (caller notes it). */
export async function apifySearchCompanies(spec: SearchSpec, creds: ApifyCreds): Promise<NormalizedCompany[]> {
  if (!creds.actorSearch) throw new Error('Apify search actor id not configured.')
  const runId = await startRun(creds.actorSearch, creds.token, {
    query: spec.keywords.join(' ') || spec.description,
    locations: spec.locations,
    employeeMin: spec.employeeMin,
    employeeMax: spec.employeeMax,
    maxResults: 50
  })
  const status = await waitForRun(runId, creds.token)
  if (status !== 'SUCCEEDED') {
    throw new Error(status === 'TIMED-OUT' ? 'Apify run timed out (try a faster actor or fewer results).' : 'Apify run failed.')
  }
  const items = await fetchDataset(runId, creds.token)
  return items.map(normalizeOrg).filter((c) => c.name !== 'Unnamed company' || c.domain)
}

/** Enrich a domain via a user-configured Apify actor. */
export async function apifyEnrich(domain: string, creds: ApifyCreds): Promise<{ companies: NormalizedCompany[]; people: NormalizedPerson[] }> {
  if (!creds.actorEnrich) throw new Error('Apify enrichment actor id not configured.')
  const runId = await startRun(creds.actorEnrich, creds.token, { domain, maxResults: 25 })
  const status = await waitForRun(runId, creds.token, 120_000)
  if (status !== 'SUCCEEDED') {
    throw new Error(status === 'TIMED-OUT' ? 'Apify enrichment timed out.' : 'Apify enrichment run failed.')
  }
  const items = await fetchDataset(runId, creds.token)
  return { companies: items.map(normalizeOrg), people: items.map(normalizePerson) }
}
