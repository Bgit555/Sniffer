import { z } from 'zod'
import type { NormalizedCompany, SearchSpec } from '@shared/types'
import { isAiConfigured, structured } from '../ai/router'
import { AiNotConfiguredError } from '../ai/types'

const SuggestionItem = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  industry: z.string().optional(),
  location: z.string().optional(),
  employeeHint: z.string().optional(),
  reason: z.string()
})
const SuggestionSchema = z.object({ suggestions: z.array(SuggestionItem).max(6) })

const SYSTEM = `List 3-6 plausible real companies for the profile. Return ONLY JSON: {"suggestions":[{"name","domain","industry","location","employeeHint","reason"}]}. Never invent metrics or emails.`

/**
 * "AI suggestions" discovery: when no live data provider is connected, let the
 * user's own gateway shortlist candidate companies for an ICP. Results are
 * explicitly labelled as unverified AI suggestions, never presented as live
 * directory data.
 */
export async function aiSuggestCompanies(spec: SearchSpec): Promise<NormalizedCompany[]> {
  if (!isAiConfigured()) throw new AiNotConfiguredError()
  const data = await structured<{ suggestions: { name: string; domain?: string; industry?: string; location?: string; employeeHint?: string; reason: string }[] }>({
    feature: 'search.aiSuggest',
    purpose: 'research',
    system: SYSTEM,
    user: `SUGGEST_ICP Profile: ${JSON.stringify({
      industries: spec.industries,
      locations: spec.locations,
      employees: spec.employeeMin !== undefined || spec.employeeMax !== undefined ? `${spec.employeeMin ?? '?'}–${spec.employeeMax ?? '?'}` : null,
      keywords: spec.keywords,
      signals: spec.signals,
      request: spec.description
    })}`,
    schema: SuggestionSchema,
    temperature: 0.3
  })

  return data.suggestions.map((s) => {
    const domain = s.domain ? s.domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : null
    return {
      provider: 'ai-suggested',
      name: s.name,
      domain: domain || null,
      website: domain ? `https://${domain}` : null,
      description: s.reason,
      industry: s.industry ?? null,
      country: s.location ?? null,
      employeeCount: null,
      dataConfidence: 0.4 // deliberately low — AI knowledge, not verified data
    } as NormalizedCompany
  })
}
