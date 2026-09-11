import type {
  AiSettingsInput,
  AiSettingsView,
  AnalysisView,
  CompanyView,
  JobView,
  ListView,
  OutreachView,
  ProviderSettingView,
  SearchMeta,
  SearchSpec
} from '@shared/types'

/** Unwrap Electron's IPC error wrapper into a readable message. */
function cleanError(e: unknown): Error {
  const raw = e instanceof Error ? e.message : String(e)
  const m = raw.match(/Error invoking remote method '[\w:]+': (?:Error: )?(.*)$/)
  return new Error(m ? m[1] : raw)
}

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return (await window.sniffer.invoke(channel, ...args)) as T
  } catch (e) {
    throw cleanError(e)
  }
}

export interface SearchOutcome {
  spec: SearchSpec | null
  companies: CompanyView[]
  meta: SearchMeta | null
}

export interface RecentSearch {
  id: number
  query: string
  resultCount: number
  createdAt: number
}

export interface ExportDone {
  filePath: string
  count: number
}

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

export interface SavedSearchView {
  id: number
  name: string
  query: string
  enabled: boolean
  lastRunAt: number | null
  lastResultCount: number
  lastNewMatches: number
  lastNewSignals: number
  createdAt: number
}

export interface CrmField {
  key: string
  label: string
  secret?: boolean
}

export interface CrmFieldStatus extends CrmField {
  hasValue: boolean
}

export interface CrmMeta {
  id: string
  name: string
  description: string
  fields: CrmField[]
}

export interface CrmStatus {
  id: string
  name: string
  description: string
  enabled: boolean
  configured: boolean
  fields: CrmFieldStatus[]
}

export interface CrmPushResult {
  id: string
  name: string
  ok: boolean
  message: string
}

export interface OAuthStatus {
  id: string
  name: string
  kind: string
  description: string
  note?: string
  connected: boolean
  connectedAt: number | null
  hasApp: boolean
}

export interface OAuthProviderView {
  id: string
  name: string
  kind: string
  description: string
  note?: string
}

export interface TestResult {
  ok: boolean
  message: string
}

export interface AutopilotSummary {
  ok: boolean
  task: string
  log: string[]
  errors: string[]
  companiesFound: number
  companiesEnriched: number
  companiesAnalyzed: number
  listId?: number
  listName?: string
  sources: { id: string; name: string; demo?: boolean }[]
}

export interface AutopilotLog {
  line: string
  at: number
}

export interface RunPromptInput {
  promptId?: number | null
  companyId: number
  personId?: number | null
  offer?: string
  adhocTitle?: string
  adhocPrompt?: string
}

export interface SavedSearchRun {
  view: SavedSearchView
  companies: CompanyView[]
}

export const api = {
  // Settings / AI
  getAi: () => call<AiSettingsView>('settings:getAi'),
  updateAi: (input: AiSettingsInput) => call<AiSettingsView>('settings:updateAi', input),
  clearAiKey: () => call<AiSettingsView>('settings:clearAiKey'),
  secureAvailable: () => call<boolean>('settings:secureAvailable'),
  testAi: () => call<{ ok: boolean; message: string; provider?: string }>('settings:testAi'),

  // Data providers
  providers: () => call<ProviderSettingView[]>('settings:providers'),
  providerCatalog: () => call<{ id: string; name: string; kind: string; description?: string; builtIn?: boolean }[]>('settings:providerCatalog'),
  saveProviderKey: (id: string, key: string) => call<ProviderSettingView[]>('settings:saveProviderKey', id, key),
  clearProviderKey: (id: string) => call<ProviderSettingView[]>('settings:clearProviderKey', id),
  setProviderEnabled: (id: string, enabled: boolean) => call<ProviderSettingView[]>('settings:setProviderEnabled', id, enabled),
  getDemoFallback: () => call<boolean>('settings:getDemoFallback'),
  setDemoFallback: (enabled: boolean) => call<boolean>('settings:setDemoFallback', enabled),
  getApifyActors: () => call<{ search: string; enrich: string }>('settings:getApifyActors'),
  setApifyActor: (kind: 'search' | 'enrichment', actorId: string) => call<{ search: string; enrich: string }>('settings:setApifyActor', kind, actorId),

  // CRM connections
  crmList: () => call<CrmStatus[]>('crm:list'),
  crmCatalog: () => call<CrmMeta[]>('crm:catalog'),
  crmSetCredential: (id: string, fields: Record<string, string>) => call<CrmStatus[]>('crm:setCredential', id, fields),
  crmClear: (id: string) => call<CrmStatus[]>('crm:clearCredential', id),
  crmSetEnabled: (id: string, enabled: boolean) => call<CrmStatus[]>('crm:setEnabled', id, enabled),
  crmTest: (id: string) => call<CrmPushResult>('crm:test', id),
  crmPushCompany: (companyId: number) => call<CrmPushResult[]>('crm:pushCompany', companyId),
  crmPushList: (listId: number) => call<{ jobStarted: boolean }>('crm:pushList', listId),

  // Provider live tests + OAuth
  testProvider: (id: string) => call<TestResult>('settings:testProvider', id),
  oauthList: () => call<OAuthStatus[]>('oauth:list'),
  oauthCatalog: () => call<OAuthProviderView[]>('oauth:catalog'),
  oauthSetApp: (id: string, clientId: string, clientSecret: string) => call<OAuthStatus[]>('oauth:setApp', id, clientId, clientSecret),
  oauthConnect: (id: string) => call<{ ok: boolean; message: string; who?: string }>('oauth:connect', id),
  oauthDisconnect: (id: string) => call<OAuthStatus[]>('oauth:disconnect', id),

  // Search
  runSearch: (query: string) => call<SearchOutcome>('search:run', query),
  recentSearches: () => call<RecentSearch[]>('search:recent'),
  reopenSearch: (searchId: number) => call<SearchOutcome>('search:reopen', searchId),

  // Companies / intelligence
  getCompany: (id: number) => call<CompanyView | null>('company:get', id),
  enrichCompany: (id: number, method?: 'auto' | 'providers' | 'web' | 'ai') =>
    call<{ company: CompanyView; note: string }>('company:enrich', id, method),
  analyzeCompany: (id: number) => call<CompanyView>('company:analyze', id),
  analyzeList: (listId: number) => call<{ jobStarted: boolean }>('company:analyzeList', listId),
  enrichList: (listId: number, method?: 'auto' | 'providers' | 'web' | 'ai') =>
    call<{ jobStarted: boolean }>('company:enrichList', listId, method),
  generateOutreach: (req: {
    companyId: number
    personId?: number | null
    channel: string
    tone: string
    offer: string
  }) => call<OutreachView>('company:outreach', req),
  outreachHistory: () => call<OutreachView[]>('outreach:history'),

  // Prompts
  promptList: (category?: string) => call<PromptTemplateView[]>('prompts:list', category),
  promptCategories: () => call<string[]>('prompts:categories'),
  promptCreate: (input: Omit<PromptTemplateView, 'id' | 'usageCount'>) => call<PromptTemplateView>('prompts:create', input),
  promptUpdate: (id: number, input: Partial<PromptTemplateView>) => call<void>('prompts:update', id, input),
  promptDelete: (id: number) => call<void>('prompts:delete', id),
  promptRun: (input: RunPromptInput) => call<PromptRunView>('prompts:run', input),
  promptRuns: (limit?: number) => call<PromptRunView[]>('prompts:runs', limit),

  // Saved searches
  savedSearches: () => call<SavedSearchView[]>('savedSearches:list'),
  createSavedSearch: (name: string, query: string) => call<SavedSearchView>('savedSearches:create', name, query),
  deleteSavedSearch: (id: number) => call<void>('savedSearches:delete', id),
  setSavedSearchEnabled: (id: number, enabled: boolean) => call<void>('savedSearches:setEnabled', id, enabled),
  runSavedSearch: (id: number) => call<SavedSearchRun>('savedSearches:run', id),

  // Lists
  lists: () => call<ListView[]>('lists:list'),
  createList: (name: string, description?: string) => call<ListView>('lists:create', name, description),
  renameList: (id: number, name: string) => call<void>('lists:rename', id, name),
  deleteList: (id: number) => call<void>('lists:delete', id),
  addCompanyToList: (listId: number, companyId: number) => call<boolean>('lists:addCompany', listId, companyId),
  addCompaniesToList: (listId: number, companyIds: number[]) => call<number>('lists:addCompanies', listId, companyIds),
  removeCompanyFromList: (listId: number, companyId: number) => call<void>('lists:removeCompany', listId, companyId),
  listCompanies: (listId: number) => call<CompanyView[]>('lists:companies', listId),
  listsOfCompany: (companyId: number) => call<number[]>('lists:ofCompany', companyId),

  // Jobs / export
  jobs: () => call<JobView[]>('jobs:list'),
  exportList: (listId: number) => call<number>('export:list', listId),
  exportSelection: (companyIds: number[]) => call<number>('export:selection', companyIds),
  openExportFolder: () => call<void>('export:openFolder'),
  revealPath: (filePath: string) => call<void>('export:openResult', filePath),

  // Autopilot
  autopilotRun: (task: string) => call<AutopilotSummary>('autopilot:run', task)
}

/** Subscribe to a main-process event; returns an unsubscribe function. */
export function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  return window.sniffer.on(channel, (payload) => cb(payload as T))
}

export function parseErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function isAiNotConfigured(e: unknown): boolean {
  return /AI is not configured/i.test(parseErrorMessage(e))
}

export type {
  AiSettingsView,
  AnalysisView,
  CompanyView,
  JobView,
  ListView,
  OutreachView,
  ProviderSettingView,
  SearchMeta,
  SearchSpec
}
