import type { NormalizedCompany, SearchSpec } from '@shared/types'
import { demoCompanies, type DemoCompany } from './demoData'
import type { SearchProvider } from './provider'

const COUNTRY_ALIASES: Record<string, string> = {
  us: 'US',
  usa: 'US',
  'united states': 'US',
  america: 'US',
  canada: 'CA',
  uk: 'GB',
  'united kingdom': 'GB',
  britain: 'GB',
  germany: 'DE',
  france: 'FR',
  australia: 'AU',
  india: 'IN',
  'new zealand': 'NZ'
}

const INDUSTRY_ALIASES: Record<string, string[]> = {
  saas: ['saas', 'software'],
  software: ['saas', 'software'],
  'developer tools': ['devtools', 'developer', 'infrastructure'],
  devtools: ['devtools', 'developer'],
  devops: ['devtools', 'infrastructure'],
  infrastructure: ['infrastructure', 'devtools'],
  cybersecurity: ['security', 'cybersecurity'],
  security: ['security', 'cybersecurity'],
  fintech: ['fintech'],
  financial: ['fintech'],
  healthtech: ['healthtech', 'healthcare', 'clinical'],
  healthcare: ['healthcare', 'healthtech', 'clinical'],
  ai: ['ai', 'mlops'],
  'data & analytics': ['data', 'analytics'],
  analytics: ['data', 'analytics'],
  regtech: ['regtech', 'compliance'],
  'climate tech': ['climate', 'cleantech', 'energy'],
  cleantech: ['climate', 'cleantech', 'energy'],
  ecommerce: ['ecommerce', 'retail'],
  'hr tech': ['hrtech'],
  hr: ['hrtech']
}

const SIGNAL_HINTS: Record<string, string[]> = {
  funding: ['funding', 'raised', 'seed', 'series a', 'series b', 'series c', 'capital'],
  recent_funding: ['funding', 'raised', 'seed', 'series'],
  hiring: ['hiring', 'recruit', 'jobs', 'grow team'],
  marketing_hiring: ['hiring', 'marketing'],
  sales_hiring: ['hiring', 'sales'],
  expansion: ['expansion', 'office', 'opened', 'expanding'],
  leadership: ['leadership', 'cro', 'cso', 'ciso', 'vice president', 'hired new'],
  product: ['product', 'launched', 'launch'],
  new_executive: ['leadership', 'hired']
}

function locationCode(raw: string): string | null {
  const code = COUNTRY_ALIASES[raw.trim().toLowerCase()]
  return code ?? null
}

function industryTerms(raw: string): string[] {
  return INDUSTRY_ALIASES[raw.trim().toLowerCase()] ?? [raw.trim().toLowerCase()]
}

export class DemoSearchProvider implements SearchProvider {
  readonly id = 'demo'
  private all: DemoCompany[] = demoCompanies()

  searchCompanies(spec: SearchSpec, limit = 12): NormalizedCompany[] {
    const locationCodes = spec.locations.map(locationCode).filter(Boolean)
    const industryTermsList = spec.industries.flatMap(industryTerms)
    const keywords = spec.keywords.map((k) => k.toLowerCase())
    const signalTerms = spec.signals.flatMap((s) => SIGNAL_HINTS[s.toLowerCase()] ?? [s.toLowerCase()])
    const totalText = (spec.description || '').toLowerCase()
    const descKeywords = totalText ? totalText.split(/[^a-z#]+/i).filter((w) => w.length > 2) : []
    const allKeywords = [...keywords, ...descKeywords]

    const scored = this.all
      .map((c) => {
        const haystack = [c.name, c.description ?? '', c.industry ?? '', ...c.tags].join(' ').toLowerCase()
        let score = 0
        let matched = true

        if (locationCodes.length) {
          const countryOk = locationCodes.some((l) => c.country === l)
          if (!countryOk) matched = false
        }

        if (industryTermsList.length) {
          const indOk = industryTermsList.some((term) => {
            if (term.length <= 2) return false
            return c.tags.includes(term) || (c.industry ?? '').toLowerCase().includes(term)
          })
          if (!indOk) matched = false
          else score += 3
        }

        if (spec.employeeMin !== undefined && (c.employeeCount ?? 0) < spec.employeeMin) matched = false
        if (spec.employeeMax !== undefined && (c.employeeCount ?? 0) > spec.employeeMax) matched = false

        if (allKeywords.length) {
          for (const kw of allKeywords) if (kw.length > 2 && haystack.includes(kw)) score += 1
        }

        if (signalTerms.length) {
          const has = c.signals?.some((s) => signalTerms.some((t) => (s.type + ' ' + (s.title ?? '')).toLowerCase().includes(t)))
          if (!has) matched = false
          else score += 4
        }

        // Soft bonus for having recent signals at all (ICP-style).
        score += (c.signals?.length ?? 0) * 0.5
        score += (c.employeeCount ?? 0) > 0 ? 0.5 : 0
        if (c.dataConfidence) score += c.dataConfidence

        return { c, score, matched }
      })
      .filter((r) => r.matched)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.c)

    // No meaningful filters? Still return a curated default list (best signals first).
    const noFilters =
      locationCodes.length === 0 &&
      industryTermsList.length === 0 &&
      spec.employeeMin === undefined &&
      spec.employeeMax === undefined &&
      allKeywords.length === 0 &&
      signalTerms.length === 0

    if (noFilters && scored.length === 0) {
      return [...this.all]
        .sort((a, b) => (b.signals?.length ?? 0) - (a.signals?.length ?? 0))
        .slice(0, limit)
    }
    return scored
  }
}
