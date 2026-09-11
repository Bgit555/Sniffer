import { desc, eq } from 'drizzle-orm'
import { getDb, lastInsertRowid } from '../db'
import { promptTemplates, promptRuns } from '../db/schema'
import { getCompanyView } from '../data/companyRepo'
import { getPerson } from '../data/personRepo'
import { chatText, modelForPurpose } from '../ai/router'
import type { ModelPurpose } from '../ai/types'
import type { PersonView } from '@shared/types'

const now = () => Date.now()

export interface PromptTemplateView {
  id: number
  title: string
  description: string | null
  category: string | null
  template: string
  variables: string[]
  modelProfile: string | null
  usageCount: number
}

export interface PromptRunView {
  id: number
  promptId: number | null
  title: string
  companyId: number | null
  companyName: string | null
  prompt: string
  result: string
  model: string | null
  createdAt: number
}

// ---------- Seed templates ----------

const SEEDS: Omit<PromptTemplateView, 'id' | 'usageCount'>[] = [
  {
    title: 'Personalized outreach (cold email)',
    description: 'Write a short, evidence-based cold email from a prospect’s signals.',
    category: 'Personalize Outreach',
    modelProfile: 'writing',
    variables: ['company.name', 'company.recent_signal', 'person.first_name', 'person.title', 'user.offer'],
    template: `Write a cold email to {{person.first_name}} ({{person.title}} at {{company.name}}).

Context:
- Company: {{company.name}} — {{company.industry}}, {{company.description}}
- Recent signal: {{company.recent_signal}}
- What we offer: {{user.offer}}

Rules: only use the facts above, keep it under 120 words, make it specific, and end with a low-friction question.`
  },
  {
    title: 'Meeting prep brief',
    description: '5-minute brief to prepare a first call.',
    category: 'Meeting Prep',
    modelProfile: 'research',
    variables: ['company.name', 'company.industry', 'company.recent_signal', 'person.title'],
    template: `Prepare a concise meeting brief about {{company.name}}.

Use only this context:
- Company: {{company.name}} ({{company.industry}})
- About: {{company.description}}
- Recent signals: {{company.recent_signal}}
- Contact: {{person.title}}

Return: 3 bullets on the company, 2 likely goals/pain points, and 3 conversation-starting questions.`
  },
  {
    title: 'Company research brief',
    description: 'Summarise what is known about a company.',
    category: 'Research',
    modelProfile: 'research',
    variables: ['company.name', 'company.industry', 'company.description', 'company.recent_signal'],
    template: `Summarise what we know about {{company.name}} ({{company.industry}}).

Description: {{company.description}}
Signals: {{company.recent_signal}}

Write a short structured brief: overview, what stands out, and what we still don't know. Do not invent details.`
  },
  {
    title: 'Enrichment gap analysis',
    description: 'Identify missing data to enrich a prospect.',
    category: 'Enrichment',
    modelProfile: 'extraction',
    variables: ['company.name', 'company.description'],
    template: `Given this prospect: {{company.name}} — {{company.description}}

List the most valuable missing data points we should enrich (decision-makers, technologies, revenue, etc.) as a short checklist.`
  },
  {
    title: 'Recruiting outreach',
    description: 'Message to a candidate or hiring manager.',
    category: 'Recruiting',
    modelProfile: 'writing',
    variables: ['company.name', 'person.first_name', 'person.title', 'user.offer'],
    template: `Write a warm recruiting message to {{person.first_name}} ({{person.title}} at {{company.name}}).

Role/opportunity we are offering: {{user.offer}}

Keep it under 100 words, sincere, and end with an invitation to chat.`
  },
  {
    title: 'Competitive intel note',
    description: 'Frame a company as a competitor signal.',
    category: 'Competitive Intelligence',
    modelProfile: 'research',
    variables: ['company.name', 'company.industry', 'company.description', 'company.recent_signal'],
    template: `Analyse {{company.name}} ({{company.industry}}) as a competitive signal.

About: {{company.description}}
Recent signals: {{company.recent_signal}}

Write 3 short notes on what this means for us and one recommended action.`
  }
]

export async function ensurePromptSeeds(): Promise<void> {
  const db = getDb()
  const existing = await db.select({ id: promptTemplates.id }).from(promptTemplates).all()
  if (existing.length > 0) return
  for (const s of SEEDS) {
    await db
      .insert(promptTemplates)
      .values({
        title: s.title,
        description: s.description,
        category: s.category,
        template: s.template,
        variables: JSON.stringify(s.variables),
        modelProfile: s.modelProfile,
        usageCount: 0,
        createdAt: now()
      })
      .run()
  }
}

// ---------- Template CRUD ----------

function toView(row: typeof promptTemplates.$inferSelect): PromptTemplateView {
  let variables: string[] = []
  try {
    variables = JSON.parse(row.variables ?? '[]')
  } catch {
    variables = []
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    template: row.template,
    variables,
    modelProfile: row.modelProfile,
    usageCount: row.usageCount ?? 0
  }
}

export async function listTemplates(category?: string): Promise<PromptTemplateView[]> {
  const db = getDb()
  const rows = category
    ? await db.select().from(promptTemplates).where(eq(promptTemplates.category, category)).all()
    : await db.select().from(promptTemplates).all()
  return rows.map(toView)
}

export async function createTemplate(input: Omit<PromptTemplateView, 'id' | 'usageCount'>): Promise<PromptTemplateView> {
  const db = getDb()
  await db
    .insert(promptTemplates)
    .values({
      title: input.title,
      description: input.description,
      category: input.category,
      template: input.template,
      variables: JSON.stringify(input.variables),
      modelProfile: input.modelProfile,
      usageCount: 0,
      createdAt: now()
    })
    .run()
  const id = lastInsertRowid()
  return { id, ...input, usageCount: 0 }
}

export async function updateTemplate(id: number, input: Partial<PromptTemplateView>): Promise<void> {
  const db = getDb()
  const set: Partial<typeof promptTemplates.$inferInsert> = {}
  if (input.title !== undefined) set.title = input.title
  if (input.description !== undefined) set.description = input.description
  if (input.category !== undefined) set.category = input.category
  if (input.template !== undefined) set.template = input.template
  if (input.variables !== undefined) set.variables = JSON.stringify(input.variables)
  if (input.modelProfile !== undefined) set.modelProfile = input.modelProfile
  await db.update(promptTemplates).set(set).where(eq(promptTemplates.id, id)).run()
}

export async function deleteTemplate(id: number): Promise<void> {
  const db = getDb()
  await db.delete(promptTemplates).where(eq(promptTemplates.id, id)).run()
}

// ---------- Run ----------

export interface RunPromptInput {
  promptId?: number | null
  companyId?: number | null
  personId?: number | null
  offer?: string
  adhocTitle?: string
  adhocPrompt?: string
}

function purposeFor(profile: string | null | undefined): ModelPurpose {
  switch (profile) {
    case 'research':
      return 'research'
    case 'extraction':
      return 'extraction'
    case 'writing':
      return 'writing'
    default:
      return 'writing'
  }
}

/** Render {{company.name}} / {{person.first_name}} / {{user.offer}} placeholders. */
export function renderTemplate(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => ctx[key] ?? ctx[key.trim()] ?? '')
}

function buildContext(company: Awaited<ReturnType<typeof getCompanyView>>, person: PersonView | null, offer: string): Record<string, string> {
  const recentSignal = company?.signals?.[0]?.title ?? 'No signal on file'
  return {
    'company.name': company?.name ?? '',
    'company.industry': company?.industry ?? '',
    'company.description': company?.description ?? '',
    'company.recent_signal': recentSignal,
    'company.website': company?.website ?? '',
    'company.employee_count': company?.employeeCount ? String(company.employeeCount) : '',
    'person.first_name': person?.firstName ?? '',
    'person.last_name': person?.lastName ?? '',
    'person.title': person?.title ?? 'decision maker',
    'person.email': person?.email ?? '',
    'user.offer': offer || '(not provided)'
  }
}

export async function runPrompt(input: RunPromptInput): Promise<PromptRunView> {
  const company = input.companyId ? await getCompanyView(input.companyId) : null
  const person = input.personId ? await getPerson(input.personId) : null

  let template: PromptTemplateView | null = null
  let title = input.adhocTitle ?? 'Custom prompt'
  let promptText = input.adhocPrompt ?? ''
  let purpose: ModelPurpose = 'writing'

  if (input.promptId) {
    const db = getDb()
    const row = await db.select().from(promptTemplates).where(eq(promptTemplates.id, input.promptId)).get()
    if (!row) throw new Error('Prompt template not found.')
    template = toView(row)
    title = template.title
    purpose = purposeFor(template.modelProfile)
  }

  const ctx = buildContext(company, person, input.offer ?? '')
  promptText = template ? renderTemplate(template.template, ctx) : promptText

  const system = 'You are an expert B2B prospecting assistant. Use ONLY the context you are given; never invent facts, names, or numbers.'
  const result = await chatText({ purpose, system, prompt: promptText })
  const model = modelForPurpose(purpose)

  const db = getDb()
  await db
    .insert(promptRuns)
    .values({
      promptId: input.promptId ?? null,
      title,
      companyId: input.companyId ?? null,
      companyName: company?.name ?? null,
      prompt: promptText,
      result,
      model,
      createdAt: now()
    })
    .run()
  const id = lastInsertRowid()

  if (input.promptId) {
    await db
      .update(promptTemplates)
      .set({ usageCount: (template?.usageCount ?? 0) + 1 })
      .where(eq(promptTemplates.id, input.promptId))
      .run()
  }

  return {
    id,
    promptId: input.promptId ?? null,
    title,
    companyId: input.companyId ?? null,
    companyName: company?.name ?? null,
    prompt: promptText,
    result,
    model,
    createdAt: Date.now()
  }
}

export async function listRuns(limit = 30): Promise<PromptRunView[]> {
  const db = getDb()
  const rows = await db.select().from(promptRuns).orderBy(desc(promptRuns.createdAt)).limit(limit).all()
  return rows.map((r) => ({
    id: r.id,
    promptId: r.promptId,
    title: r.title,
    companyId: r.companyId,
    companyName: r.companyName,
    prompt: r.prompt,
    result: r.result,
    model: r.model,
    createdAt: r.createdAt ?? 0
  }))
}
