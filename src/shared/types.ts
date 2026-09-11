import { z } from 'zod'

/** Normalized search specification produced by the AI query parser. */
export const SearchSpecSchema = z.object({
  entity: z.enum(['company', 'person']).default('company'),
  locations: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  employeeMin: z.number().int().optional(),
  employeeMax: z.number().int().optional(),
  keywords: z.array(z.string()).default([]),
  signals: z.array(z.string()).default([]),
  titles: z.array(z.string()).default([]),
  description: z.string().default('')
})
export type SearchSpec = z.infer<typeof SearchSpecSchema>

export const EMPTY_SEARCH_SPEC: SearchSpec = {
  entity: 'company',
  locations: [],
  industries: [],
  employeeMin: undefined,
  employeeMax: undefined,
  keywords: [],
  signals: [],
  titles: [],
  description: ''
}

/** A normalised, provider-agnostic company record. */
export interface NormalizedCompany {
  provider: string
  providerRecordId?: string
  name: string
  domain?: string | null
  website?: string | null
  description?: string | null
  industry?: string | null
  employeeCount?: number | null
  country?: string | null
  city?: string | null
  linkedinUrl?: string | null
  logoUrl?: string | null
  dataConfidence?: number | null
  signals?: NormalizedSignal[]
  people?: NormalizedPerson[]
}

export interface NormalizedSignal {
  type: string
  title?: string | null
  summary?: string | null
  sourceUrl?: string | null
  source?: string | null
  publishedAt?: number | null
  confidence?: number | null
}

export interface NormalizedPerson {
  provider: string
  providerRecordId?: string
  firstName?: string | null
  lastName?: string | null
  title?: string | null
  companyName?: string | null
  email?: string | null
  emailStatus?: string | null
  linkedinUrl?: string | null
  location?: string | null
}

/** Enriched/analysed company surfaced to the UI. */
export interface CompanyView {
  id: number
  name: string
  domain: string | null
  website: string | null
  description: string | null
  industry: string | null
  employeeCount: number | null
  country: string | null
  city: string | null
  linkedinUrl: string | null
  logoUrl: string | null
  dataConfidence: number | null
  createdAt: number
  updatedAt: number
  signals: SignalView[]
  people: PersonView[]
  analysis: AnalysisView | null
}

export interface SignalView {
  id: number
  type: string
  title: string | null
  summary: string | null
  sourceUrl: string | null
  source: string | null
  publishedAt: number | null
  confidence: number | null
}

export interface PersonView {
  id: number
  firstName: string | null
  lastName: string | null
  title: string | null
  email: string | null
  emailStatus: string | null
  linkedinUrl: string | null
  location: string | null
}

export interface RubricScores {
  digitalPresence: number
  socialActivity: number
  industryFit: number
  scalePotential: number
  notes: string[]
}

export interface AnalysisView {
  id: number
  fitScore: number | null
  whyFit: string[]
  painPoints: string[]
  recommendedAngle: string | null
  personalizationHooks: string[]
  rubric: RubricScores | null
  model: string | null
  createdAt: number
}

export interface ListView {
  id: number
  name: string
  description: string | null
  memberCount: number
  createdAt: number
  updatedAt: number
}

export interface OutreachView {
  id: number
  companyId: number | null
  companyName: string | null
  personId: number | null
  personName: string | null
  channel: string
  tone: string | null
  message: string
  model: string | null
  createdAt: number
}

export interface JobView {
  id: number
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  error: string | null
  createdAt: number
  completedAt: number | null
}

export type AiProviderKind = 'openai' | 'anthropic'

/** Public AI settings — never includes the API key itself. */
export interface AiSettingsView {
  provider: AiProviderKind
  baseUrl: string
  modelDefault: string
  modelResearch: string
  modelWriting: string
  modelExtraction: string
  temperature: number
  maxTokens: number
  hasApiKey: boolean
  preset: string
}

/** What the renderer may send back. Empty apiKey = keep existing. */
export interface AiSettingsInput {
  provider?: AiProviderKind
  baseUrl?: string
  modelDefault?: string
  modelResearch?: string
  modelWriting?: string
  modelExtraction?: string
  temperature?: number
  maxTokens?: number
  apiKey?: string
  preset?: string
}

export interface ProviderSettingView {
  id: string
  name: string
  capabilities: ('search' | 'enrichment')[]
  enabled: boolean
  hasApiKey: boolean
  description?: string
}

/** Which source(s) actually produced search results, for UI acknowledgement. */
export interface SearchSource {
  id: string
  name: string
  demo?: boolean
}

export interface SearchMeta {
  providers: SearchSource[]
  usedDemo: boolean
  notes: string[]
}
