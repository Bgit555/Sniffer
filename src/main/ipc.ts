import { ipcMain, shell } from 'electron'
import type { AiSettingsInput, CompanyView, ListView, ProviderSettingView } from '@shared/types'
import { initDb } from './db'
import { runSearch } from './search/pipeline'
import { getCompanyView, recentSearches, searchCompanyIds } from './data/companyRepo'
import {
  addCompaniesToList,
  addCompanyToList,
  companyListIds,
  createList,
  deleteList,
  listAll as listAllLists,
  listCompanies,
  renameList,
  removeCompanyFromList
} from './data/listRepo'
import { clearAiApiKey, getAiSettings, updateAiSettings } from './services/settingsService'
import { isSecureStorageAvailable } from './services/secureStore'
import {
  clearProviderKey,
  demoFallbackEnabled,
  getProviderSettings,
  providerApiKey,
  providerList,
  setDemoFallbackEnabled,
  setProviderEnabled,
  setProviderKey
} from './providers/registry'
import {
  clearCrmCredential,
  crmMetaList,
  listCrmStatuses,
  pushCompanyToEnabledCrms,
  setCrmCredential,
  setCrmEnabled,
  testCrm
} from './crm'
import { connectOAuth, disconnectOAuth, oauthListCatalog, oauthStatuses, setOAuthApp } from './oauth'
import { runAutopilot } from './services/autopilotService'
import { apifyTest } from './providers/apify'
import { apolloTest } from './providers/apollo'
import { analyzeCompany, generateOutreach, enrichCompany, type OutreachRequest } from './services/intelligenceService'
import { makeClient, modelForPurpose } from './ai/router'
import { exportCompaniesToCsv, openExportFolder } from './services/exportService'
import { enqueue, listJobs, registerJobHandler, resumePendingJobs } from './services/jobs'
import { broadcast } from './events/bus'
import { outreachHistory } from './data/contentRepo'
import {
  ensurePromptSeeds,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  runPrompt,
  listRuns,
  type PromptTemplateView,
  type RunPromptInput
} from './services/promptService'
import {
  listSavedSearches,
  createSavedSearch,
  deleteSavedSearch,
  setSavedSearchEnabled,
  runSavedSearch
} from './services/savedSearchService'

export function registerIpc(): void {
  initDb()
  void ensurePromptSeeds()

  // ---- Settings / AI -------------------------------------------------------
  ipcMain.handle('settings:getAi', () => getAiSettings())
  ipcMain.handle('settings:updateAi', (_e, input: AiSettingsInput) => updateAiSettings(input))
  ipcMain.handle('settings:clearAiKey', () => {
    clearAiApiKey()
    return getAiSettings()
  })
  ipcMain.handle('settings:secureAvailable', () => isSecureStorageAvailable())

  // ---- Data providers ------------------------------------------------------
  ipcMain.handle('settings:providers', (): ProviderSettingView[] => getProviderSettings())
  ipcMain.handle('settings:providerCatalog', () => providerList())
  ipcMain.handle('settings:saveProviderKey', (_e, id: string, key: string) => {
    if (!key.trim()) throw new Error('Enter an API key.')
    const ok = setProviderKey(id, key)
    if (!ok) throw new Error('Secure storage unavailable — provider key was NOT saved.')
    return getProviderSettings()
  })
  ipcMain.handle('settings:clearProviderKey', (_e, id: string) => {
    clearProviderKey(id)
    return getProviderSettings()
  })
  ipcMain.handle('settings:setProviderEnabled', (_e, id: string, enabled: boolean) => {
    setProviderEnabled(id, enabled)
    return getProviderSettings()
  })
  ipcMain.handle('settings:getDemoFallback', () => demoFallbackEnabled())
  ipcMain.handle('settings:setDemoFallback', (_e, enabled: boolean) => {
    setDemoFallbackEnabled(enabled)
    return demoFallbackEnabled()
  })

  // ---- CRM connections -----------------------------------------------------
  ipcMain.handle('crm:list', () => listCrmStatuses())
  ipcMain.handle('crm:catalog', () => crmMetaList())
  ipcMain.handle('crm:setCredential', (_e, id: string, fields: Record<string, string>) => {
    setCrmCredential(id, fields)
    return listCrmStatuses()
  })
  ipcMain.handle('crm:clearCredential', (_e, id: string) => {
    clearCrmCredential(id)
    return listCrmStatuses()
  })
  ipcMain.handle('crm:setEnabled', (_e, id: string, enabled: boolean) => {
    setCrmEnabled(id, enabled)
    return listCrmStatuses()
  })
  ipcMain.handle('settings:testProvider', (_e, id: string) => {
    const key = providerApiKey(id)
    if (!key) return { ok: false, message: 'Save a key for this provider first.' }
    if (id.includes('apify')) return apifyTest(key)
    if (id.includes('apollo')) return apolloTest(key)
    return { ok: false, message: 'No live test available for this provider.' }
  })

  // ---- OAuth ("Login with …") ---------------------------------------------
  ipcMain.handle('oauth:list', () => oauthStatuses())
  ipcMain.handle('oauth:catalog', () => oauthListCatalog())
  ipcMain.handle('oauth:setApp', (_e, id: string, clientId: string, clientSecret: string) => {
    setOAuthApp(id, clientId, clientSecret)
    return oauthStatuses()
  })
  ipcMain.handle('oauth:connect', (_e, id: string) => connectOAuth(id))
  ipcMain.handle('oauth:disconnect', (_e, id: string) => {
    disconnectOAuth(id)
    return oauthStatuses()
  })
  ipcMain.handle('crm:test', (_e, id: string) => testCrm(id))
  ipcMain.handle('crm:pushCompany', (_e, companyId: number) => pushCompanyToEnabledCrms(companyId))
  ipcMain.handle('crm:pushList', async (_e, listId: number) => {
    await enqueue('crm_push', { listId })
    return { jobStarted: true }
  })

  ipcMain.handle('autopilot:run', (_e, task: string) =>
    runAutopilot(task, { onLog: (line) => broadcast('autopilot:log', { line, at: Date.now() }) })
  )

  ipcMain.handle('settings:testAi', async () => {
    const cfg = getAiSettings()
    if (!cfg.baseUrl || !cfg.hasApiKey) return { ok: false, message: 'Set a gateway URL and API key first.' }
    try {
      const client = makeClient()
      const model = modelForPurpose('default') || modelForPurpose('extraction')
      const res = await client.chat([{ role: 'user', content: 'Reply with the single word: ok' }], {
        model: model || undefined
      })
      return { ok: true, message: `Connected. Model "${res.model || model || 'default'}" replied: ${res.text.slice(0, 60)}`, provider: cfg.provider }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  // ---- Search --------------------------------------------------------------
  ipcMain.handle('search:run', async (_e, query: string) => {
    if (typeof query !== 'string' || !query.trim()) throw new Error('Describe the prospects you want to find.')
    return runSearch(query)
  })
  ipcMain.handle('search:recent', () => recentSearches())
  ipcMain.handle('search:reopen', async (_e, searchId: number) => {
    const ids = await searchCompanyIds(searchId)
    const companies = ids.length ? await getCompanyViewsByIds(ids) : []
    return { spec: null, companies, meta: null }
  })

  // ---- Companies -----------------------------------------------------------
  ipcMain.handle('company:get', (_e, id: number) => getCompanyView(id))
  ipcMain.handle('company:enrich', (_e, id: number, method?: string) => enrichCompany(id, (method as 'auto' | 'providers' | 'web' | 'ai') ?? 'auto'))
  ipcMain.handle('company:analyze', async (_e, id: number) => {
    await analyzeCompany(id)
    return getCompanyView(id)
  })
  ipcMain.handle('company:analyzeList', async (_e, listId: number) => {
    await enqueue('analyze_list', { listId })
    return { jobStarted: true }
  })
  ipcMain.handle('company:enrichList', async (_e, listId: number, method?: string) => {
    await enqueue('enrich_list', { listId, method: method ?? 'auto' })
    return { jobStarted: true }
  })
  ipcMain.handle('company:outreach', (_e, req: OutreachRequest) => generateOutreach(req))
  ipcMain.handle('outreach:history', () => outreachHistory())

  // ---- Prompt library ------------------------------------------------------
  ipcMain.handle('prompts:list', (_e, category?: string) => listTemplates(category))
  ipcMain.handle('prompts:categories', async () => {
    const all = await listTemplates()
    return [...new Set(all.map((t) => t.category).filter((c): c is string => Boolean(c)))]
  })
  ipcMain.handle('prompts:create', (_e, input: Omit<PromptTemplateView, 'id' | 'usageCount'>) => createTemplate(input))
  ipcMain.handle('prompts:update', (_e, id: number, input: Partial<PromptTemplateView>) => updateTemplate(id, input))
  ipcMain.handle('prompts:delete', (_e, id: number) => deleteTemplate(id))
  ipcMain.handle('prompts:run', (_e, input: RunPromptInput) => runPrompt(input))
  ipcMain.handle('prompts:runs', (_e, limit?: number) => listRuns(limit))

  // ---- Saved searches ------------------------------------------------------
  ipcMain.handle('savedSearches:list', () => listSavedSearches())
  ipcMain.handle('savedSearches:create', (_e, name: string, query: string) => createSavedSearch(name, query))
  ipcMain.handle('savedSearches:delete', (_e, id: number) => deleteSavedSearch(id))
  ipcMain.handle('savedSearches:setEnabled', (_e, id: number, enabled: boolean) => setSavedSearchEnabled(id, enabled))
  ipcMain.handle('savedSearches:run', (_e, id: number) => runSavedSearch(id))

  // ---- Lists ---------------------------------------------------------------
  ipcMain.handle('lists:list', (): Promise<ListView[]> => listAllLists())
  ipcMain.handle('lists:create', (_e, name: string, description?: string) => createList(name, description))
  ipcMain.handle('lists:rename', (_e, id: number, name: string) => renameList(id, name))
  ipcMain.handle('lists:delete', (_e, id: number) => deleteList(id))
  ipcMain.handle('lists:addCompany', (_e, listId: number, companyId: number) => addCompanyToList(listId, companyId))
  ipcMain.handle('lists:addCompanies', (_e, listId: number, companyIds: number[]) => addCompaniesToList(listId, companyIds))
  ipcMain.handle('lists:removeCompany', (_e, listId: number, companyId: number) => removeCompanyFromList(listId, companyId))
  ipcMain.handle('lists:companies', (_e, listId: number): Promise<CompanyView[]> => listCompanies(listId))
  ipcMain.handle('lists:ofCompany', (_e, companyId: number) => companyListIds(companyId))

  // ---- Jobs / Export -------------------------------------------------------
  ipcMain.handle('jobs:list', () => listJobs())
  ipcMain.handle('export:openFolder', () => {
    shell.openPath(openExportFolder())
  })
  ipcMain.handle('export:list', async (_e, listId: number) => {
    const views = await listCompanies(listId)
    return enqueue('export_csv', { listId, companyIds: views.map((v) => v.id) })
  })
  ipcMain.handle('export:selection', (_e, companyIds: number[]) => enqueue('export_csv', { companyIds }))
  ipcMain.handle('export:openResult', (_e, filePath: string) => shell.showItemInFolder(filePath))

  void resumePendingJobs()
}

async function getCompanyViewsByIds(ids: number[]): Promise<CompanyView[]> {
  const { getCompanyViews } = await import('./data/companyRepo')
  return getCompanyViews(ids)
}

/** Register background job handlers. */
export function registerJobHandlers(): void {
  registerJobHandler('export_csv', async (payload, onProgress) => {
    const p = payload as { companyIds?: number[]; listId?: number }
    const ids = p?.companyIds ?? []
    for (let i = 0; i < ids.length; i += 20) onProgress(Math.min(90, (i / ids.length) * 90))
    const result = await exportCompaniesToCsv(ids)
    onProgress(95)
    broadcast('export:done', result)
  })

  registerJobHandler('crm_push', async (payload, onProgress) => {
    const p = payload as { listId: number }
    const listCompaniesMod = await import('./data/listRepo')
    const views = await listCompaniesMod.listCompanies(p.listId)
    let i = 0
    let ok = 0
    for (const v of views) {
      try {
        const results = await pushCompanyToEnabledCrms(v.id)
        if (results.some((r) => r.ok)) ok++
      } catch {
        /* per-company failures are non-fatal */
      }
      i++
      onProgress((i / views.length) * 100)
    }
    if (ok === 0) throw new Error('No CRM connection is configured/enabled, or all pushes failed.')
  })

  registerJobHandler('enrich_list', async (payload, onProgress) => {
    const p = payload as { listId: number; method?: string }
    const listCompaniesMod = await import('./data/listRepo')
    const views = await listCompaniesMod.listCompanies(p.listId)
    let i = 0
    let ok = 0
    for (const v of views) {
      try {
        await enrichCompany(v.id, (p.method as 'auto' | 'providers' | 'web' | 'ai') ?? 'auto')
        ok++
      } catch (err) {
        console.warn('[enrich_list] skipped', v.id, err)
      }
      i++
      onProgress((i / views.length) * 100)
    }
    if (ok === 0 && views.length > 0) throw new Error('Enrichment produced no contacts for this list.')
  })

  registerJobHandler('analyze_list', async (payload, onProgress) => {
    const p = payload as { listId: number }
    const listCompaniesMod = await import('./data/listRepo')
    const views = await listCompaniesMod.listCompanies(p.listId)
    let i = 0
    for (const v of views) {
      try {
        await analyzeCompany(v.id)
      } catch (err) {
        console.warn('[analyze_list] skipped', v.id, err)
      }
      i++
      onProgress((i / views.length) * 100)
    }
  })
}

export { broadcast }
