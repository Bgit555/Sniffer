import type { NormalizedCompany, NormalizedPerson, SearchSpec } from '@shared/types'

export interface SearchProvider {
  readonly id: string
  searchCompanies(spec: SearchSpec, limit?: number): NormalizedCompany[]
}

export interface EnrichmentProvider {
  readonly id: string
  /** Fill in additional company facts (decision-makers etc.) after save. */
  enrichPeopleForCompany(company: { id: number; name: string; domain: string | null }): NormalizedPerson[]
}
