import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: integer('updated_at')
})

export const aiProfiles = sqliteTable('ai_profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  purpose: text('purpose').notNull(), // fast | research | writing | extraction | custom
  provider: text('provider'), // openai | anthropic | null = default
  model: text('model'),
  temperature: real('temperature'),
  maxTokens: integer('max_tokens'),
  systemPrompt: text('system_prompt'),
  createdAt: integer('created_at')
})

export const companies = sqliteTable('companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  domain: text('domain'),
  website: text('website'),
  description: text('description'),
  industry: text('industry'),
  employeeCount: integer('employee_count'),
  country: text('country'),
  city: text('city'),
  linkedinUrl: text('linkedin_url'),
  logoUrl: text('logo_url'),
  dataConfidence: real('data_confidence'),
  createdAt: integer('created_at'),
  updatedAt: integer('updated_at')
})

export const people = sqliteTable('people', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  firstName: text('first_name'),
  lastName: text('last_name'),
  title: text('title'),
  companyId: integer('company_id'),
  email: text('email'),
  emailStatus: text('email_status'),
  linkedinUrl: text('linkedin_url'),
  location: text('location'),
  dataConfidence: real('data_confidence'),
  createdAt: integer('created_at'),
  updatedAt: integer('updated_at')
})

export const companySources = sqliteTable('company_sources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id').notNull(),
  provider: text('provider').notNull(),
  providerRecordId: text('provider_record_id'),
  sourceUrl: text('source_url'),
  retrievedAt: integer('retrieved_at'),
  rawHash: text('raw_hash')
})

export const searches = sqliteTable('searches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  queryText: text('query_text').notNull(),
  specJson: text('spec_json'),
  status: text('status').notNull().default('completed'),
  resultCount: integer('result_count'),
  createdAt: integer('created_at')
})

export const searchResults = sqliteTable('search_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  searchId: integer('search_id').notNull(),
  companyId: integer('company_id').notNull(),
  rank: integer('rank'),
  score: real('score')
})

export const lists = sqliteTable('lists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('created_at'),
  updatedAt: integer('updated_at')
})

export const listMembers = sqliteTable('list_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  listId: integer('list_id').notNull(),
  companyId: integer('company_id').notNull(),
  addedAt: integer('added_at')
})

export const signals = sqliteTable('signals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id').notNull(),
  type: text('type').notNull(),
  title: text('title'),
  summary: text('summary'),
  sourceUrl: text('source_url'),
  source: text('source'),
  publishedAt: integer('published_at'),
  detectedAt: integer('detected_at'),
  confidence: real('confidence'),
  evidence: text('evidence')
})

export const aiAnalyses = sqliteTable('ai_analyses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id').notNull(),
  fitScore: integer('fit_score'),
  whyFit: text('why_fit'),
  painPoints: text('pain_points'),
  recommendedAngle: text('recommended_angle'),
  personalizationHooks: text('personalization_hooks'),
  rawJson: text('raw_json'),
  model: text('model'),
  createdAt: integer('created_at')
})

export const outreachGenerations = sqliteTable('outreach_generations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id'),
  personId: integer('person_id'),
  channel: text('channel').notNull(),
  tone: text('tone'),
  message: text('message'),
  model: text('model'),
  createdAt: integer('created_at')
})

export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  status: text('status').notNull().default('pending'), // pending | running | completed | failed
  payload: text('payload'),
  progress: integer('progress').default(0),
  attempts: integer('attempts').default(0),
  error: text('error'),
  createdAt: integer('created_at'),
  startedAt: integer('started_at'),
  completedAt: integer('completed_at')
})

export const promptTemplates = sqliteTable('prompt_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category'),
  template: text('template').notNull(),
  variables: text('variables'),
  modelProfile: text('model_profile'),
  usageCount: integer('usage_count').default(0),
  createdAt: integer('created_at')
})

export const savedSearches = sqliteTable('saved_searches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  query: text('query').notNull(),
  specJson: text('spec_json'),
  enabled: integer('enabled').notNull().default(1),
  lastRunAt: integer('last_run_at'),
  lastResultCount: integer('last_result_count'),
  lastNewMatches: integer('last_new_matches').default(0),
  lastNewSignals: integer('last_new_signals').default(0),
  lastResultDomains: text('last_result_domains'),
  createdAt: integer('created_at')
})

export const promptRuns = sqliteTable('prompt_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  promptId: integer('prompt_id'),
  title: text('title').notNull(),
  companyId: integer('company_id'),
  companyName: text('company_name'),
  prompt: text('prompt').notNull(),
  result: text('result').notNull(),
  model: text('model'),
  createdAt: integer('created_at')
})

export type CompanyRow = typeof companies.$inferSelect
export type PersonRow = typeof people.$inferSelect
export type ListRow = typeof lists.$inferSelect
export type SignalRow = typeof signals.$inferSelect
export type JobRow = typeof jobs.$inferSelect
export type AiProfileRow = typeof aiProfiles.$inferSelect
export type AiAnalysisRow = typeof aiAnalyses.$inferSelect
export type OutreachRow = typeof outreachGenerations.$inferSelect
export type SearchRow = typeof searches.$inferSelect
