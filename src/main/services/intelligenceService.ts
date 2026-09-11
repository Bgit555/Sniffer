import { z } from 'zod'
import type { AnalysisView, CompanyView, OutreachView, PersonView } from '@shared/types'
import { isAiConfigured, chatText, structured, modelForPurpose } from '../ai/router'
import { AiNotConfiguredError } from '../ai/types'
import { getCompanyView, saveDemoPeopleForCompany } from '../data/companyRepo'
import { insertAnalysis, insertOutreach, outreachHistory, type AnalysisInput } from '../data/contentRepo'
import { getPerson } from '../data/personRepo'
import { demoPeopleFor, signalTitleFor } from '../search/demoData'
import { enabledEnrichmentProviders, providerApiKey, cacheApifyActor, providerMeta } from '../providers/registry'
import { apolloEnrichPeople } from '../providers/apollo'
import { apifyEnrich, apifySearchActors } from '../providers/apify'
import { linkedInEnrichPeople } from '../providers/linkedin'
import { webEnrichCompany } from '../providers/webEnrich'
import type { NormalizedPerson } from '@shared/types'

const AnalysisSchema = z.object({
  fitScore: z.number().min(0).max(100),
  whyFit: z.array(z.string()).max(6),
  painPoints: z.array(z.string()).max(6),
  recommendedAngle: z.string(),
  personalizationHooks: z.array(z.string()).max(6),
  rubric: z.object({
    digitalPresence: z.number().min(0).max(100),
    socialActivity: z.number().min(0).max(100),
    industryFit: z.number().min(0).max(100),
    scalePotential: z.number().min(0).max(100),
    notes: z.array(z.string()).max(6)
  })
})

const ANALYSIS_SYSTEM = `You are a careful B2B prospecting analyst. You are given structured evidence about a company.
Produce a short JSON analysis with:
- "fitScore": integer 0-100
- "whyFit": 2-4 short reasons grounded ONLY in the evidence
- "painPoints": 1-3 plausible pain points tied to the evidence
- "recommendedAngle": one concise sentence on how to approach them
- "personalizationHooks": 2-3 concrete, specific hooks from the evidence
- "rubric": qualification sub-scores (0-100) with a one-line rationale each:
    "digitalPresence" (website/blog quality), "socialActivity" (platforms & posting), "industryFit" (relevance to B2B outreach), "scalePotential" (size & growth signals), plus "notes": array of 1-3 short qualifier notes.
Rules: NEVER invent facts, names, URLs, numbers or details that are not in the evidence. If an industry is unknown, infer carefully. Respond with ONLY valid JSON.`

const OUTREACH_SYSTEM = (channel: string, tone: string): string => `You write personalized ${channel} outreach messages for B2B prospecting.
Tone: ${tone || 'professional'}.
You are given ONLY verified evidence. Rules:
- Do not invent facts about the company or person. Do not fabricate names, metrics, funding amounts or URLs beyond what is provided.
- Reference specific evidence you are given (their signal, industry, or role).
- Keep it under 150 words, natural, and specific enough that it cannot be a mass message.
- End with a clear, low-friction question or call to action.
Output the plain message only, no subject unless it is an email (then start with a Subject: line).`

/** Describe the company evidence for the model. */
function evidenceBlock(company: CompanyView): string {
  const lines: string[] = []
  lines.push(`Company: ${company.name}`)
  if (company.industry) lines.push(`Industry: ${company.industry}`)
  if (company.employeeCount) lines.push(`Employees: ${company.employeeCount}`)
  if (company.country || company.city) lines.push(`Location: ${[company.city, company.country].filter(Boolean).join(', ')}`)
  if (company.description) lines.push(`Description: ${company.description}`)
  if (company.signals.length) {
    lines.push('Recent signals:')
    for (const s of company.signals) {
      lines.push(`- ${s.type}${s.title ? `: ${s.title}` : ''}${s.publishedAt ? ` (${new Date(s.publishedAt).toISOString().slice(0, 10)})` : ''}`)
    }
  }
  return lines.join('\n')
}

/** Deterministic, evidence-only scoring used when the AI gateway is unavailable. */
function offlineAnalysis(company: CompanyView): AnalysisInput {
  const whyFit: string[] = []
  if (company.industry) whyFit.push(`Operates in ${company.industry}.`)
  if (company.signals.length > 0) {
    for (const s of company.signals.slice(0, 2)) {
      const label = signalTitleFor(s.type)
      whyFit.push(`Recent signal: ${s.title ?? label.toLowerCase()}.`)
    }
  }
  if (whyFit.length === 0 && company.description) whyFit.push('Matches your described profile.')

  const signalScore = Math.min(30, company.signals.length * 8)
  const base = 45
  const confidence = company.dataConfidence ? Math.round((company.dataConfidence - 0.6) * 40) : 0
  const score = Math.max(5, Math.min(92, base + signalScore + confidence + (company.employeeCount ? 5 : 0)))

  const painPoints: string[] = []
  if (company.industry) painPoints.push(`Competitive hiring in ${company.industry} makes talent a priority.`)
  if (company.signals.some((s) => s.type === 'expansion')) painPoints.push('Rapid expansion strains go-to-market capacity.')

  const notes: string[] = []
  if (company.website || company.description) notes.push('Has a web presence to build on.')
  if (company.signals.length > 0) notes.push('Recent signals indicate momentum.')
  if (!company.employeeCount) notes.push('Company size unknown — verify before prioritising.')

  const rubric = {
    digitalPresence: company.website || company.description ? 60 : 30,
    socialActivity: company.signals.filter((s) => ['hiring', 'expansion', 'product'].includes(s.type)).length > 0 ? 55 : 30,
    industryFit: company.industry ? 65 : 40,
    scalePotential: company.employeeCount ? Math.min(90, 40 + Math.round((company.employeeCount / 200) * 50)) : 40,
    notes
  }

  return {
    fitScore: score,
    whyFit,
    painPoints,
    recommendedAngle: 'Reference a recent, specific signal to start the conversation.',
    personalizationHooks: company.signals.slice(0, 2).map((s) => s.title ?? signalTitleFor(s.type)),
    rubric,
    model: null
  }
}

export async function analyzeCompany(companyId: number): Promise<AnalysisView> {
  const company = await getCompanyView(companyId)
  if (!company) throw new Error('Company not found.')
  const evidence = evidenceBlock(company)

  let analysis: AnalysisInput
  let model: string | null = null

  if (isAiConfigured()) {
    try {
      model = modelForPurpose('research')
      const parsed = await structured<Omit<AnalysisInput, 'model'>>({
        feature: 'analysis.company',
        purpose: 'research',
        system: ANALYSIS_SYSTEM,
        user: `Analyze this prospect:\n\n${evidence}`,
        schema: AnalysisSchema
      })
      analysis = { ...parsed, model }
    } catch (err) {
      if (err instanceof AiNotConfiguredError) throw err
      console.warn('[analysis] AI failed, using offline analysis:', err)
      analysis = offlineAnalysis(company)
      model = null
    }
  } else {
    analysis = offlineAnalysis(company)
  }

  return insertAnalysis(companyId, { ...analysis, model })
}

export interface OutreachRequest {
  companyId: number
  personId?: number | null
  channel: 'email' | 'linkedin' | 'whatsapp'
  tone: string
  offer: string
}

export async function generateOutreach(req: OutreachRequest): Promise<OutreachView> {
  const company = await getCompanyView(req.companyId)
  if (!company) throw new Error('Company not found.')
  let person: PersonView | null = null
  if (req.personId) person = await getPerson(req.personId)

  const personLine = person
    ? `Contact: ${[person.firstName, person.lastName].filter(Boolean).join(' ')} (${person.title ?? 'decision maker'})`
    : 'Contact: (no specific person chosen — write it addressed to the company)'
  const offerLine = req.offer?.trim() ? `Offer/what you do: ${req.offer.trim()}` : 'Offer: (not provided)'
  const evidence = [evidenceBlock(company), personLine, offerLine].join('\n')

  let message: string
  let model: string | null = null

  if (isAiConfigured()) {
    try {
      model = modelForPurpose('writing')
      // Case-study RAG: pull recent saved outreach as style reference so new
      // messages stay consistent with what already worked locally.
      let prompt = evidence
      try {
        const history = await outreachHistory(undefined, 4)
        const examples = history.filter((h) => h.message).slice(0, 3).map((h) => h.message).join('\n---\n')
        if (examples.trim()) {
          prompt = `${evidence}\n\nReference only (past outreach style, do not copy content):\n${examples.slice(0, 1500)}`
        }
      } catch {
        /* RAG is best-effort */
      }
      message = await chatText({
        purpose: 'writing',
        system: OUTREACH_SYSTEM(req.channel, req.tone),
        prompt
      })
    } catch (err) {
      if (err instanceof AiNotConfiguredError) throw err
      console.warn('[outreach] AI failed, using offline template:', err)
      message = offlineOutreach(company, person, req)
      model = null
    }
  } else {
    message = offlineOutreach(company, person, req)
  }

  const stored = await insertOutreach({
    companyId: req.companyId,
    personId: req.personId ?? null,
    channel: req.channel,
    tone: req.tone,
    message,
    model
  })
  return stored
}

function offlineOutreach(company: CompanyView, person: PersonView | null, req: OutreachRequest): string {
  const firstName = person?.firstName ?? 'there'
  const signal = company.signals[0]
  const target = person?.title ? `as ${person.title}` : ''
  const lines: string[] = []
  lines.push(`Hi ${firstName},`)
  lines.push('')
  lines.push(
    `${req.offer?.trim() ?? 'We help teams like yours'}. I noticed ${company.name}${company.industry ? ` (${company.industry})` : ''}${signal ? ` recently ${signal.title?.toLowerCase() ?? signal.type}` : ''} — it looked like a timely fit, so I wanted to reach out ${target}.`
  )
  lines.push('')
  lines.push('Would you be open to a quick chat this week?')
  return lines.join('\n')
}

/**
 * AI enrichment: estimate the decision-maker *roles* a company likely needs for
 * outreach. Deliberately role-level only — never invents real names or emails —
 * and is surfaced as low-confidence, unverified.
 */
async function aiEnrichPeople(company: CompanyView): Promise<NormalizedPerson[]> {
  if (!isAiConfigured()) return []
  try {
    const schema = z.object({
      contacts: z.array(z.object({ title: z.string(), reason: z.string().optional() })).max(6)
    })
    const data = await structured<{ contacts: { title: string; reason?: string }[] }>({
      feature: 'enrich.ai',
      purpose: 'research',
      system:
        'You estimate likely decision-maker job titles a company needs for B2B outreach. Base it ONLY on the given industry, size and signals. Do NOT invent real people\'s names, emails, or numbers. Return ONLY JSON: {"contacts":[{"title":"VP Marketing","reason":"why"}]} (max 6).',
      user: evidenceBlock(company),
      schema
    })
    return data.contacts.map((c) => ({
      provider: 'ai-enrich',
      firstName: null,
      lastName: null,
      title: c.title,
      email: null,
      emailStatus: 'unknown',
      companyName: company.name
    }))
  } catch {
    return []
  }
}

export type EnrichMethod = 'auto' | 'providers' | 'web' | 'ai'

export interface EnrichResult {
  company: CompanyView
  note: string
}

/** Apify enrichment with free/lower-tier actor fallback: try candidates in order. */
async function apifyEnrichWithFallback(company: CompanyView, apiKey: string): Promise<NormalizedPerson[]> {
  const terms = ['contact email enrichment', company.industry ?? ''].filter(Boolean).join(' ')
  const candidates = await apifySearchActors(apiKey, terms)
  for (const c of candidates.slice(0, 4)) {
    try {
      const out = await apifyEnrich(company.domain!, { token: apiKey, actorSearch: '', actorEnrich: c.actorId })
      if (out.people.length > 0) {
        cacheApifyActor('enrichment', c.actorId)
        return out.people
      }
    } catch {
      /* try next (free/lower-tier) actor */
    }
  }
  throw new Error('Apify: no free/usable actor returned contacts for this company.')
}

/**
 * Enrichment with a selectable method:
 *  - 'providers': Apollo/Apify/LinkedIn only
 *  - 'web':       scrape the company website for real contacts (AI-parsed when available)
 *  - 'ai':        AI role estimates only
 *  - 'auto' (default): providers → web → ai → demo
 */
export async function enrichCompany(companyId: number, method: EnrichMethod = 'auto'): Promise<EnrichResult> {
  const company = await getCompanyView(companyId)
  if (!company) throw new Error('Company not found.')

  let people: NormalizedPerson[] = []
  let note = ''
  const errors: string[] = []
  const live = enabledEnrichmentProviders()

  const providersPass = async (): Promise<void> => {
    for (const provider of live) {
      const apiKey = providerApiKey(provider.id)
      if (!apiKey) continue
      try {
        let found: NormalizedPerson[] = []
        if (provider.id === 'apify' && company.domain) {
          found = await apifyEnrichWithFallback(company, apiKey)
        } else if (provider.id === 'linkedin' && company.domain) {
          found = await linkedInEnrichPeople(company.domain, apiKey)
        } else if (company.domain) {
          found = await apolloEnrichPeople(company.domain, apiKey)
        }
        if (found.length > 0) {
          people = found
          note = `Enriched via ${providerMeta(provider.id)?.name ?? provider.id}: ${found.length} contact${found.length === 1 ? '' : 's'}.`
          return
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
        console.warn(`[enrich] ${provider.id} failed:`, err)
      }
    }
  }

  const webPass = async (): Promise<void> => {
    const w = await webEnrichCompany(company)
    if (w.people.length > 0) {
      people = w.people
      note = w.note
    } else if (w.note) {
      note = w.note
    }
  }

  const aiPass = async (): Promise<void> => {
    if (!isAiConfigured()) return
    const p = await aiEnrichPeople(company)
    if (p.length > 0) {
      people = p
      note = `AI enrichment: ${p.length} estimated role${p.length === 1 ? '' : 's'} (no verified contacts).`
    }
  }

  if (method === 'providers') {
    await providersPass()
  } else if (method === 'web') {
    await webPass()
  } else if (method === 'ai') {
    await aiPass()
  } else {
    // auto: providers → web → ai → demo
    await providersPass()
    if (!people.length) await webPass()
    if (!people.length) await aiPass()
    if (!people.length) {
      if (live.length === 0 && !isAiConfigured()) {
        const hints: string[] = []
        for (const s of company.signals) {
          if (s.type === 'hiring' && /market/i.test(s.title ?? '')) hints.push('VP Marketing', 'Head of Growth')
          if (s.type === 'hiring' && /sales|ae/i.test(s.title ?? '')) hints.push('VP Sales')
          if (s.type === 'funding') hints.push('Founder & CEO', 'Head of Finance')
          if (s.type === 'expansion') hints.push('VP Operations')
        }
        if (hints.length === 0) hints.push('Founder & CEO', 'VP Sales', 'VP Marketing')
        people = demoPeopleFor({ name: company.name, domain: company.domain }, hints)
        note = `Demo enrichment: ${people.length} sample contact${people.length === 1 ? '' : 's'} (fictional).`
      } else if (errors.length > 0) {
        throw new Error(`Enrichment failed — ${errors[0]}`)
      }
    }
  }

  await saveDemoPeopleForCompany(companyId, people)
  const updated = (await getCompanyView(companyId))!
  if (!note) note = people.length ? `Enriched: ${people.length} contact${people.length === 1 ? '' : 's'}.` : 'No contacts found.'
  return { company: updated, note }
}
