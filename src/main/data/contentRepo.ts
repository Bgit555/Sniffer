import { desc, eq } from 'drizzle-orm'
import { getDb, lastInsertRowid } from '../db'
import { aiAnalyses, companies, outreachGenerations, people } from '../db/schema'
import type { AnalysisView, OutreachView, RubricScores } from '@shared/types'

const now = () => Date.now()

export interface AnalysisInput {
  fitScore: number
  whyFit: string[]
  painPoints: string[]
  recommendedAngle: string
  personalizationHooks: string[]
  rubric?: RubricScores | null
  model: string | null
  raw?: unknown
}

export async function insertAnalysis(companyId: number, input: AnalysisInput): Promise<AnalysisView> {
  const db = getDb()
  const t = now()
  const rawPayload = input.raw ?? (input.rubric ? { rubric: input.rubric } : null)
  await db
    .insert(aiAnalyses)
    .values({
      companyId,
      fitScore: Math.max(0, Math.min(100, Math.round(input.fitScore))),
      whyFit: JSON.stringify(input.whyFit),
      painPoints: JSON.stringify(input.painPoints),
      recommendedAngle: input.recommendedAngle,
      personalizationHooks: JSON.stringify(input.personalizationHooks),
      rawJson: rawPayload !== null ? JSON.stringify(rawPayload) : null,
      model: input.model,
      createdAt: t
    })
    .run()
  const id = lastInsertRowid()
  return {
    id,
    fitScore: Math.round(input.fitScore),
    whyFit: input.whyFit,
    painPoints: input.painPoints,
    recommendedAngle: input.recommendedAngle,
    personalizationHooks: input.personalizationHooks,
    rubric: input.rubric ?? null,
    model: input.model,
    createdAt: t
  }
}

export interface OutreachInput {
  companyId: number | null
  personId: number | null
  channel: string
  tone: string
  message: string
  model: string | null
}

export async function insertOutreach(input: OutreachInput): Promise<OutreachView> {
  const db = getDb()
  await db
    .insert(outreachGenerations)
    .values({
      companyId: input.companyId,
      personId: input.personId,
      channel: input.channel,
      tone: input.tone,
      message: input.message,
      model: input.model,
      createdAt: now()
    })
    .run()
  const id = lastInsertRowid()

  let companyName: string | null = null
  if (input.companyId) {
    const c = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, input.companyId)).get()
    companyName = c?.name ?? null
  }
  let personName: string | null = null
  if (input.personId) {
    const p = await db.select({ firstName: people.firstName, lastName: people.lastName }).from(people).where(eq(people.id, input.personId)).get()
    personName = p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || null : null
  }

  return { id, companyId: input.companyId, companyName, personId: input.personId, personName, channel: input.channel, tone: input.tone, message: input.message, model: input.model, createdAt: Date.now() }
}

export async function outreachHistory(companyId?: number, limit = 30): Promise<OutreachView[]> {
  const db = getDb()
  const base = db
    .select({
      id: outreachGenerations.id,
      companyId: outreachGenerations.companyId,
      personId: outreachGenerations.personId,
      channel: outreachGenerations.channel,
      tone: outreachGenerations.tone,
      message: outreachGenerations.message,
      model: outreachGenerations.model,
      createdAt: outreachGenerations.createdAt
    })
    .from(outreachGenerations)

  const rows = companyId
    ? await base.where(eq(outreachGenerations.companyId, companyId)).orderBy(desc(outreachGenerations.createdAt)).limit(limit).all()
    : await base.orderBy(desc(outreachGenerations.createdAt)).limit(limit).all()

  const out: OutreachView[] = []
  for (const r of rows) {
    let companyName: string | null = null
    let personName: string | null = null
    if (r.companyId) {
      const c = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, r.companyId)).get()
      companyName = c?.name ?? null
    }
    if (r.personId) {
      const p = await db.select({ firstName: people.firstName, lastName: people.lastName }).from(people).where(eq(people.id, r.personId)).get()
      personName = p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || null : null
    }
    out.push({
      id: r.id,
      companyId: r.companyId,
      companyName,
      personId: r.personId,
      personName,
      channel: r.channel,
      tone: r.tone,
      message: r.message ?? '',
      model: r.model,
      createdAt: r.createdAt ?? 0
    })
  }
  return out
}
