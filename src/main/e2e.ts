import { createServer } from 'http'
import { runSearch } from './search/pipeline'
import { parseQuery } from './search/parseQuery'
import { getCompanyView } from './data/companyRepo'
import { analyzeCompany, enrichCompany, generateOutreach } from './services/intelligenceService'
import { createList, addCompanyToList, listCompanies } from './data/listRepo'
import { exportCompaniesToCsv } from './services/exportService'
import { enqueue, listJobs } from './services/jobs'
import { appDirs } from './services/appPaths'
import { updateAiSettings, clearAiApiKey, getAiSettings } from './services/settingsService'
import { listTemplates, renderTemplate } from './services/promptService'
import { createSavedSearch, runSavedSearch } from './services/savedSearchService'
import { demoFallbackEnabled, setDemoFallbackEnabled } from './providers/registry'
import { runAutopilot } from './services/autopilotService'

/**
 * Headless end-to-end smoke test. Runs when `SNIFFER_E2E=1`; prints a JSON
 * summary to stdout and exits. Exercises the full core workflow without any AI
 * gateway (offline paths) so it runs on a clean machine.
 */
export async function runE2e(): Promise<Record<string, unknown>> {
  const report: Record<string, unknown> = {}

  // 1. Search (natural language → demo provider → SQLite)
  const out = await runSearch('US SaaS companies with 20–200 employees that recently raised funding')
  report.searchResults = out.companies.length
  if (out.companies.length === 0) throw new Error('E2E: search returned no companies')
  const first = out.companies[0]

  // 2. List + membership
  const list = await createList('E2E Test List', 'created by self-test')
  await addCompanyToList(list.id, first.id)
  const members = await listCompanies(list.id)
  report.listMembers = members.length

  // 3. Enrich (demo contacts)
  const enriched = await enrichCompany(first.id)
  report.contacts = enriched.company.people.length

  // 4. Analyze (offline path — no AI gateway configured)
  const analyzed = await analyzeCompany(first.id)
  report.fitScore = analyzed.fitScore

  // 5. Outreach (offline template)
  const outreach = await generateOutreach({
    companyId: first.id,
    channel: 'email',
    tone: 'Professional',
    offer: 'We build AI agents for B2B marketing teams.'
  })
  report.outreachLength = outreach.message.length
  if (outreach.message.length < 20) throw new Error('E2E: outreach too short')

  // 6. CSV export
  const exp = await exportCompaniesToCsv([first.id])
  report.exportFile = exp.filePath

  // 7. Background job queue (export as job)
  await enqueue('export_csv', { companyIds: [first.id], listId: list.id })
  // let the queue settle
  await new Promise((r) => setTimeout(r, 600))
  const jobs = await listJobs()
  report.jobsCompleted = jobs.filter((j) => j.status === 'completed').length

  const view = await getCompanyView(first.id)
  report.companyAnalysisPresent = view?.analysis !== null
  report.demoFallbackUsed = out.meta?.usedDemo === true

  // 8. Saved search re-run delta detection (first run = all new, second = none)
  const saved = await createSavedSearch('E2E saved search', 'US SaaS companies 20-200 employees')
  const run1 = await runSavedSearch(saved.id)
  const run2 = await runSavedSearch(saved.id)
  report.savedSearchResults = run1.view.lastResultCount
  report.savedFirstNew = run1.view.lastNewMatches
  report.savedSecondNew = run2.view.lastNewMatches
  if (run2.view.lastNewMatches !== 0) throw new Error('E2E: expected 0 new matches on second saved-search run')

  // 9. Prompt seeds + variable rendering
  const tpls = await listTemplates()
  report.seededPrompts = tpls.length
  if (tpls.length < 5) throw new Error('E2E: prompt seeds not present')
  const rendered = renderTemplate('Hi {{person.first_name}} at {{company.name}}', { 'person.first_name': 'Alex', 'company.name': 'Acme' })
  report.renderOk = rendered === 'Hi Alex at Acme'
  if (!report.renderOk) throw new Error('E2E: template variable rendering failed')

  // 10. Autopilot (offline orchestration: search → list → enrich → analyze)
  const ap = await runAutopilot('US SaaS companies with 20-200 employees')
  report.autopilot = { ok: ap.ok, found: ap.companiesFound, enriched: ap.companiesEnriched, analyzed: ap.companiesAnalyzed, hasList: ap.listId != null }
  if (!ap.ok || ap.companiesFound === 0 || ap.companiesEnriched === 0 || ap.companiesAnalyzed === 0 || !ap.listId) {
    throw new Error('E2E: autopilot failed: ' + JSON.stringify(report.autopilot))
  }

  // 11. Demo fallback toggle persists
  setDemoFallbackEnabled(true)
  const on = demoFallbackEnabled()
  setDemoFallbackEnabled(false)
  const off = !demoFallbackEnabled()
  report.demoFallbackToggleOk = on && off
  if (!report.demoFallbackToggleOk) throw new Error('E2E: demo fallback toggle not persisted')

  report.userDataDir = appDirs().root
  return report
}

/**
 * AI-layer test against a local mock OpenAI/Anthropic-compatible gateway.
 * Run with SNIFFER_E2E_AI=1. Validates request formatting, JSON parsing and
 * Zod validation without any real provider.
 */
export async function runE2eAi(): Promise<Record<string, unknown>> {
  const report: Record<string, unknown> = {}
  const calls: string[] = []

  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      let userContent = ''
      try {
        const parsed = JSON.parse(body || '{}')
        const msgs: { role?: string; content?: unknown }[] = Array.isArray(parsed.messages) ? parsed.messages : []
        const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
        userContent = typeof lastUser?.content === 'string' ? lastUser.content : ''
      } catch {
        /* ignore */
      }

      let content: string
      if (userContent.includes('Analyze this prospect')) {
        content = JSON.stringify({
          fitScore: 77,
          whyFit: ['Fits target industry', 'Matches company size'],
          painPoints: ['Growing go-to-market pressure'],
          recommendedAngle: 'Open with the recent signal.',
          personalizationHooks: ['Recent signal', 'Role relevance']
        })
      } else if (userContent.includes('Offer/what you do') || userContent.includes('Offer:')) {
        content = 'Mock personalized outreach for the prospect.'
      } else if (userContent.includes('SUGGEST_ICP')) {
        content = JSON.stringify({
          suggestions: [
            { name: 'Mocklytics', domain: 'mocklytics.io', industry: 'SaaS', location: 'United States', employeeHint: '50-150', reason: 'Mock suggestion' }
          ]
        })
      } else {
        content = JSON.stringify({
          entity: 'company',
          locations: ['United States'],
          industries: ['SaaS'],
          employeeMin: 20,
          employeeMax: 200,
          keywords: [],
          signals: ['recent_funding'],
          titles: [],
          description: userContent.slice(0, 200)
        })
      }

      const path = (req.url ?? '').split('?')[0]
      calls.push(path)
      const isAnthropic = path.includes('/v1/messages') || path.endsWith('/messages')
      const payload = isAnthropic
        ? { content: [{ type: 'text', text: content }], model: 'mock-anthropic' }
        : { choices: [{ message: { role: 'assistant', content } }], model: 'mock-openai' }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(payload))
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('mock server failed')
  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
    // OpenAI-compatible
    updateAiSettings({
      provider: 'openai',
      baseUrl,
      modelDefault: 'mock-default',
      modelResearch: 'mock-research',
      modelWriting: 'mock-writing',
      modelExtraction: 'mock-extraction',
      temperature: 0.1,
      maxTokens: 512,
      apiKey: 'mock-key'
    })
    const spec = await parseQuery('US SaaS companies with 20-200 employees that recently raised funding')
    if (!spec.industries.includes('SaaS') || !spec.locations.includes('United States')) {
      throw new Error('AI parse result unexpected: ' + JSON.stringify(spec))
    }

    const search = await runSearch(spec.description || 'US SaaS 20-200 funding')
    if (!search.meta.providers.some((p) => p.id === 'ai')) throw new Error('AI-suggestion search did not run')
    const id = search.companies[0]?.id
    if (!id) throw new Error('no company for AI analysis')
    const analysis = await analyzeCompany(id)
    if (analysis.fitScore !== 77) throw new Error('openai analysis fitScore=' + analysis.fitScore)

    // Anthropic-compatible against the same mock
    updateAiSettings({ provider: 'anthropic', baseUrl })
    const analysis2 = await analyzeCompany(id)
    if (analysis2.fitScore !== 77) throw new Error('anthropic analysis fitScore=' + analysis2.fitScore)

    // chatText (outreach) through anthropic
    const outreach = await generateOutreach({ companyId: id, channel: 'linkedin', tone: 'Friendly', offer: 'AI for marketing.' })
    if (!outreach.message.includes('Mock')) throw new Error('anthropic chat text unexpected: ' + outreach.message.slice(0, 60))

    report.openaiEndpoint = calls.includes('/chat/completions') || calls.some((c) => c.endsWith('/chat/completions'))
    report.anthropicEndpoint = calls.some((c) => c.endsWith('/messages'))
    report.parseOk = true
    report.providerSeen = getAiSettings().provider
    report.analysisFit = analysis2.fitScore
    report.outreachOk = true
  } finally {
    server.close()
    // Don't leave the app pointed at the closed mock server.
    updateAiSettings({ baseUrl: '', modelDefault: '', modelResearch: '', modelWriting: '', modelExtraction: '' })
    clearAiApiKey()
  }
  return report
}
