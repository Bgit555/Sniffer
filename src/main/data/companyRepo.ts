import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { getDb, lastInsertRowid } from '../db'
import {
  aiAnalyses,
  companies,
  companySources,
  listMembers,
  people,
  searchResults,
  searches,
  signals
} from '../db/schema'
import type { NormalizedCompany, NormalizedPerson, NormalizedSignal, SearchSpec } from '@shared/types'
import type { AnalysisView, CompanyView, PersonView, SignalView } from '@shared/types'

const now = () => Date.now()

function toSignalsView(rows: (typeof signals.$inferSelect)[]): SignalView[] {
  return rows.map((s) => ({
    id: s.id,
    type: s.type,
    title: s.title,
    summary: s.summary,
    sourceUrl: s.sourceUrl,
    source: s.source,
    publishedAt: s.publishedAt,
    confidence: s.confidence
  }))
}

function toPeopleView(rows: (typeof people.$inferSelect)[]): PersonView[] {
  return rows.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    title: p.title,
    email: p.email,
    emailStatus: p.emailStatus,
    linkedinUrl: p.linkedinUrl,
    location: p.location
  }))
}

function toAnalysisView(row: (typeof aiAnalyses.$inferSelect) | undefined): AnalysisView | null {
  if (!row) return null
  const arr = (s: string | null): string[] => {
    if (!s) return []
    try {
      const v = JSON.parse(s)
      return Array.isArray(v) ? v.map(String) : []
    } catch {
      return []
    }
  }
  let rubric = null
  if (row.rawJson) {
    try {
      const raw = JSON.parse(row.rawJson) as { rubric?: { digitalPresence: number; socialActivity: number; industryFit: number; scalePotential: number; notes: string[] } }
      if (raw.rubric) rubric = raw.rubric
    } catch {
      /* ignore malformed raw json */
    }
  }
  return {
    id: row.id,
    fitScore: row.fitScore,
    whyFit: arr(row.whyFit),
    painPoints: arr(row.painPoints),
    recommendedAngle: row.recommendedAngle,
    personalizationHooks: arr(row.personalizationHooks),
    rubric,
    model: row.model,
    createdAt: row.createdAt ?? 0
  }
}

async function upsertCompany(n: NormalizedCompany): Promise<{ id: number; created: boolean }> {
  const db = getDb()
  const key = (n.domain ?? '').toLowerCase().trim()
  if (key) {
    const existing = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.domain, key || ''))
      .get()
    if (existing) return { id: existing.id, created: false }
  }
  await db
    .insert(companies)
    .values({
      name: n.name,
      domain: key || null,
      website: n.website ?? (key ? `https://${key}` : null),
      description: n.description,
      industry: n.industry,
      employeeCount: n.employeeCount,
      country: n.country,
      city: n.city,
      linkedinUrl: n.linkedinUrl,
      logoUrl: n.logoUrl,
      dataConfidence: n.dataConfidence,
      createdAt: now(),
      updatedAt: now()
    })
    .run()
  const id = lastInsertRowid()
  await recordSource(id, n)
  return { id, created: true }
}

async function recordSource(companyId: number, n: NormalizedCompany): Promise<void> {
  const db = getDb()
  await db
    .insert(companySources)
    .values({
      companyId,
      provider: n.provider,
      providerRecordId: n.providerRecordId,
      sourceUrl: n.website ?? null,
      retrievedAt: now(),
      rawHash: String(n.domain ?? n.name)
    })
    .run()
}

async function attachSignals(companyId: number, list: NormalizedSignal[]): Promise<void> {
  const db = getDb()
  for (const s of list) {
    if (!s.type) continue
    const existing = await db
      .select({ id: signals.id })
      .from(signals)
      .where(and(eq(signals.companyId, companyId), eq(signals.type, s.type), eq(signals.title ?? '', s.title ?? '')))
      .get()
    if (existing) continue
    await db
      .insert(signals)
      .values({
        companyId,
        type: s.type,
        title: s.title ?? null,
        summary: s.summary ?? null,
        sourceUrl: s.sourceUrl ?? null,
        source: s.source ?? null,
        publishedAt: s.publishedAt ?? null,
        detectedAt: now(),
        confidence: s.confidence ?? null
      })
      .run()
  }
}

export async function persistCompanyMatches(
  query: string,
  spec: SearchSpec,
  matches: NormalizedCompany[],
  opts: { skipHistory?: boolean } = {}
): Promise<CompanyView[]> {
  const db = getDb()
  const ids: number[] = []
  let searchId: number | null = null
  if (!opts.skipHistory) {
    const t = now()
    await db
      .insert(searches)
      .values({ queryText: query, specJson: JSON.stringify(spec), status: 'completed', resultCount: matches.length, createdAt: t })
      .run()
    searchId = lastInsertRowid()
  }

  let rank = 0
  for (const m of matches) {
    const { id } = await upsertCompany(m)
    ids.push(id)
    await attachSignals(id, m.signals ?? [])
    if (searchId !== null) {
      await db.insert(searchResults).values({ searchId, companyId: id, rank: ++rank, score: null }).run()
    }
  }

  return ids.length ? getCompanyViews(ids) : []
}

export async function getCompanyViews(companyIds: number[]): Promise<CompanyView[]> {
  const db = getDb()
  if (!companyIds.length) return []
  const rows = await db.select().from(companies).where(inArray(companies.id, companyIds)).all()
  rows.sort((a, b) => companyIds.indexOf(a.id) - companyIds.indexOf(b.id))
  const views: CompanyView[] = []

  for (const row of rows) {
    const [sigRows, peopleRows] = await Promise.all([
      db.select().from(signals).where(eq(signals.companyId, row.id)).all(),
      db.select().from(people).where(eq(people.companyId, row.id)).all()
    ])
    const analysis = toAnalysisView(
      await db.select().from(aiAnalyses).where(eq(aiAnalyses.companyId, row.id)).orderBy(desc(aiAnalyses.createdAt)).get()
    )
    views.push({
      id: row.id,
      name: row.name,
      domain: row.domain,
      website: row.website,
      description: row.description,
      industry: row.industry,
      employeeCount: row.employeeCount,
      country: row.country,
      city: row.city,
      linkedinUrl: row.linkedinUrl,
      logoUrl: row.logoUrl,
      dataConfidence: row.dataConfidence,
      createdAt: row.createdAt ?? 0,
      updatedAt: row.updatedAt ?? 0,
      signals: toSignalsView(sigRows),
      people: toPeopleView(peopleRows),
      analysis
    })
  }
  return views
}

export async function getCompanyView(id: number): Promise<CompanyView | null> {
  const views = await getCompanyViews([id])
  return views[0] ?? null
}

export async function recentSearches(limit = 12): Promise<{ id: number; query: string; resultCount: number; createdAt: number }[]> {
  const db = getDb()
  const rows = await db
    .select({ id: searches.id, queryText: searches.queryText, resultCount: searches.resultCount, createdAt: searches.createdAt })
    .from(searches)
    .orderBy(desc(searches.createdAt))
    .limit(limit)
    .all()
  return rows.map((r) => ({ id: r.id, query: r.queryText, resultCount: r.resultCount ?? 0, createdAt: r.createdAt ?? 0 }))
}

export async function searchCompanyIds(searchId: number): Promise<number[]> {
  const db = getDb()
  const rows = await db
    .select({ companyId: searchResults.companyId })
    .from(searchResults)
    .where(eq(searchResults.searchId, searchId))
    .orderBy(asc(searchResults.rank))
    .all()
  return rows.map((r) => r.companyId)
}

export async function saveDemoPeopleForCompany(companyId: number, peopleList: NormalizedPerson[]): Promise<PersonView[]> {
  const db = getDb()
  const company = await db.select().from(companies).where(eq(companies.id, companyId)).get()
  if (!company) return []

  const existingRows = await db.select().from(people).where(eq(people.companyId, companyId)).all()
  const existingKeys = new Set(
    existingRows.map((p) => `${(p.firstName ?? '').toLowerCase()}|${(p.lastName ?? '').toLowerCase()}|${(p.title ?? '').toLowerCase()}`)
  )

  for (const p of peopleList) {
    const key = `${(p.firstName ?? '').toLowerCase()}|${(p.lastName ?? '').toLowerCase()}|${(p.title ?? '').toLowerCase()}`
    if (existingKeys.has(key)) continue
    await db
      .insert(people)
      .values({
        companyId,
        firstName: p.firstName,
        lastName: p.lastName,
        title: p.title,
        email: p.email,
        emailStatus: p.emailStatus,
        linkedinUrl: p.linkedinUrl,
        location: p.location,
        dataConfidence: p.provider === 'demo' ? 0.7 : null,
        createdAt: now(),
        updatedAt: now()
      })
      .run()
    existingKeys.add(key)
  }

  const rows = await db.select().from(people).where(eq(people.companyId, companyId)).all()
  return toPeopleView(rows)
}

export async function listMembersForCompany(companyId: number): Promise<number[]> {
  const db = getDb()
  const rows = await db.select({ listId: listMembers.listId }).from(listMembers).where(eq(listMembers.companyId, companyId)).all()
  return rows.map((r) => r.listId)
}
