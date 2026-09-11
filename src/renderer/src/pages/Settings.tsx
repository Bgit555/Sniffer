import { useCallback, useEffect, useState } from 'react'
import type { AiSettingsView, ProviderSettingView } from '@shared/types'
import {
  api,
  type CrmMeta,
  type CrmStatus,
  type OAuthProviderView,
  type OAuthStatus,
  type ProviderSettingView as ApiProviderView
} from '../lib/api'
import { useApp } from '../lib/app-context'

type Tab = 'ai' | 'sources' | 'apps' | 'storage'

const TABS: { id: Tab; label: string }[] = [
  { id: 'ai', label: 'AI gateway' },
  { id: 'sources', label: 'Search & enrichment' },
  { id: 'apps', label: 'CRM & connected apps' },
  { id: 'storage', label: 'Storage' }
]

const AI_PRESETS: { key: string; name: string; provider: 'openai' | 'anthropic'; baseUrl: string; model: string }[] = [
  { key: 'OpenAI', name: 'OpenAI', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { key: 'Anthropic', name: 'Anthropic', provider: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5' },
  { key: 'Gemini', name: 'Google Gemini', provider: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash' },
  { key: 'DeepSeek', name: 'DeepSeek', provider: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { key: 'Ollama', name: 'Ollama (local)', provider: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
  { key: 'OpenRouter', name: 'OpenRouter', provider: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  { key: 'Hugging Face', name: 'Hugging Face', provider: 'openai', baseUrl: 'https://api-inference.huggingface.co/v1', model: 'meta-llama/Llama-3.1-8B-Instruct' }
]

export default function Settings(): React.JSX.Element {
  const { notify } = useApp()
  const [tab, setTab] = useState<Tab>('ai')

  // ---- AI gateway ----
  const [ai, setAi] = useState<AiSettingsView | null>(null)
  const [secureAvailable, setSecureAvailable] = useState(false)
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  // ---- Providers ----
  const [providers, setProviders] = useState<ProviderSettingView[]>([])
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({})
  const [providerTest, setProviderTest] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [demoFallback, setDemoFallback] = useState(false)

  // ---- CRM ----
  const [crms, setCrms] = useState<CrmStatus[]>([])
  const [crmCatalog, setCrmCatalog] = useState<CrmMeta[]>([])
  const [crmFields, setCrmFields] = useState<Record<string, Record<string, string>>>({})
  const [crmTest, setCrmTest] = useState<Record<string, { ok: boolean; message: string }>>({})

  // ---- OAuth ----
  const [oauthApps, setOauthApps] = useState<OAuthStatus[]>([])
  const [oauthCat, setOauthCat] = useState<OAuthProviderView[]>([])
  const [oauthFields, setOauthFields] = useState<Record<string, { clientId: string; clientSecret: string }>>({})

  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, p, sec, c, cat, demo, oa, oac] = await Promise.all([
        api.getAi(),
        api.providers(),
        api.secureAvailable(),
        api.crmList(),
        api.crmCatalog(),
        api.getDemoFallback(),
        api.oauthList(),
        api.oauthCatalog()
      ])
      setAi(s)
      setProviders(p)
      setSecureAvailable(sec)
      setCrms(c)
      setCrmCatalog(cat)
      setDemoFallback(demo)
      setOauthApps(oa)
      setOauthCat(oac)
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Failed to load settings.')
    }
  }, [notify])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (id: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(id)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  if (!ai) {
    return (
      <div className="center">
        <span className="spinner" /> Loading…
      </div>
    )
  }

  // ---- AI actions ----
  const saveAi = async (): Promise<void> => {
    setSaving(true)
    try {
      const wantedKey = key.trim()
      const updated = await api.updateAi({
        provider: ai.provider,
        baseUrl: ai.baseUrl,
        modelDefault: ai.modelDefault,
        modelResearch: ai.modelResearch,
        modelWriting: ai.modelWriting,
        modelExtraction: ai.modelExtraction,
        temperature: ai.temperature,
        maxTokens: ai.maxTokens,
        apiKey: wantedKey || undefined,
        preset: ai.preset
      })
      setAi(updated)
      setKey('')
      if (wantedKey && updated.hasApiKey) notify('success', 'Saved — API key stored securely (Windows DPAPI).')
      else if (wantedKey && !updated.hasApiKey) notify('error', 'API key was NOT stored — secure storage unavailable.')
      else notify('success', 'Settings saved.')
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const testAi = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await api.testAi())
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setTesting(false)
    }
  }

  const clearAiKey = async (): Promise<void> => {
    setAi(await api.clearAiKey())
    setKey('')
    notify('info', 'API key cleared.')
  }

  // ---- Provider actions ----
  const saveProviderKey = async (id: string, name: string): Promise<void> => {
    const value = (providerKeys[id] ?? '').trim()
    if (!value) return
    await run(`save-${id}`, async () => {
      setProviders(await api.saveProviderKey(id, value))
      setProviderKeys((k) => ({ ...k, [id]: '' }))
      notify('success', `${name}: key saved and enabled.`)
    })
  }

  const clearProviderKey = async (id: string, name: string): Promise<void> => {
    await run(`save-${id}`, async () => {
      setProviders(await api.clearProviderKey(id))
      setProviderKeys((k) => ({ ...k, [id]: '' }))
      notify('info', `${name}: key cleared.`)
    })
  }

  const toggleProvider = async (id: string, enabled: boolean): Promise<void> => {
    setProviders(await api.setProviderEnabled(id, enabled))
  }

  const testProvider = async (id: string): Promise<void> => {
    await run(`test-${id}`, async () => {
      const res = await api.testProvider(id)
      setProviderTest((t) => ({ ...t, [id]: res }))
    })
  }

  const toggleDemoFallback = async (): Promise<void> => {
    const next = await api.setDemoFallback(!demoFallback)
    setDemoFallback(next)
    notify('success', next ? 'Demo fallback enabled.' : 'Demo fallback disabled — only live provider results shown.')
  }

  // ---- CRM actions ----
  const saveCrm = async (crm: CrmMeta): Promise<void> => {
    const draft = crmFields[crm.id] ?? {}
    const fields: Record<string, string> = {}
    for (const f of crm.fields) if (draft[f.key]) fields[f.key] = draft[f.key]
    if (Object.keys(fields).length === 0) return
    await run(`crm-${crm.id}`, async () => {
      setCrms(await api.crmSetCredential(crm.id, fields))
      setCrmFields((k) => ({ ...k, [crm.id]: {} }))
      notify('success', `${crm.name}: connection saved.`)
    })
  }

  const testCrm = async (crm: CrmMeta): Promise<void> => {
    await run(`crm-${crm.id}`, async () => {
      const res = await api.crmTest(crm.id)
      setCrmTest((t) => ({ ...t, [crm.id]: res }))
    })
  }

  const toggleCrm = async (crm: CrmStatus): Promise<void> => {
    setCrms(await api.crmSetEnabled(crm.id, !crm.enabled))
  }

  const clearCrm = async (crm: CrmMeta): Promise<void> => {
    setCrms(await api.crmClear(crm.id))
    setCrmFields((k) => ({ ...k, [crm.id]: {} }))
    notify('info', `${crm.name}: connection cleared.`)
  }

  // ---- OAuth actions ----
  const saveOAuthApp = async (app: OAuthProviderView): Promise<void> => {
    const draft = oauthFields[app.id] ?? { clientId: '', clientSecret: '' }
    if (!draft.clientId.trim()) return
    await run(`oauth-${app.id}`, async () => {
      setOauthApps(await api.oauthSetApp(app.id, draft.clientId, draft.clientSecret))
      setOauthFields((k) => ({ ...k, [app.id]: { clientId: '', clientSecret: '' } }))
      notify('success', `${app.name}: app saved — click Connect to authorize.`)
    })
  }

  const connectOauth = async (app: OAuthProviderView): Promise<void> => {
    await run(`oauth-${app.id}`, async () => {
      const r = await api.oauthConnect(app.id)
      setOauthApps(await api.oauthList())
      notify(r.ok ? 'success' : 'error', r.message)
    })
  }

  const disconnectOauth = async (app: OAuthProviderView): Promise<void> => {
    setOauthApps(await api.oauthDisconnect(app.id))
    notify('info', `${app.name}: disconnected.`)
  }

  const oauthDraft = (appId: string, k: 'clientId' | 'clientSecret'): string => (oauthFields[appId] ?? { clientId: '', clientSecret: '' })[k]
  const crmDraft = (crmId: string, f: string): string => (crmFields[crmId] ?? {})[f] ?? ''

  const isBusy = (id: string): boolean => busy === id

  const dataProviders = providers.filter((p) => p.id !== 'demo')

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h2>Settings</h2>
        <div className="row-actions">
          {TABS.map((t) => (
            <button key={t.id} className={`btn ${tab === t.id ? 'primary' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'ai' && (
        <AiTab
          ai={ai}
          setAi={setAi}
          apiKey={key}
          setApiKey={setKey}
          secureAvailable={secureAvailable}
          saving={saving}
          saveAi={saveAi}
          testing={testing}
          testAi={testAi}
          testResult={testResult}
          clearAiKey={clearAiKey}
        />
      )}

      {tab === 'sources' && (
        <div>
          <p className="muted" style={{ fontSize: 13 }}>
            Search runs enabled providers; enrichment pulls contacts for saved companies. Once any live provider is saved + enabled, the
            fictional demo data stops being shown. Every provider has a <strong>Test</strong> button so you can see exactly why a call
            fails.
          </p>

          <SettingSection title="Demo data">
            <Row>
              <label className="muted" style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={demoFallback} onChange={() => void toggleDemoFallback()} />
                Fall back to the demo dataset when live providers return nothing
              </label>
              <StatusChip ok title="built-in (fictional)" />
            </Row>
          </SettingSection>

          <SettingSection title="Data providers">
            {dataProviders.map((p) => (
              <ProviderCard
                key={p.id}
                p={p}
                isBusy={isBusy}
                providerKeys={providerKeys}
                setProviderKeys={setProviderKeys}
                providerTest={providerTest}
                saveKey={saveProviderKey}
                clearKey={clearProviderKey}
                toggle={toggleProvider}
                test={testProvider}
              />
            ))}
          </SettingSection>
        </div>
      )}

      {tab === 'apps' && (
        <div>
          <p className="muted" style={{ fontSize: 13 }}>
            Use <strong>“Login with …”</strong> for HubSpot, Salesforce and LinkedIn (create an OAuth app in each provider’s developer
            console, then paste its Client ID + Secret once). HubSpot/Salesforce then push from any company or list; Odoo uses a direct
            login below.
          </p>

          <SettingSection title="Connected apps — OAuth “Login with …”">
            {oauthCat.map((app) => {
              const st = oauthApps.find((a) => a.id === app.id)
              return (
                <div key={app.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ flex: 1 }}>{app.name}</strong>
                    {st?.connected ? <StatusChip ok title="connected ✓" /> : st?.hasApp ? <StatusChip ok={false} title="app saved — connect now" /> : <StatusChip ok={false} title="app not set" />}
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                    {app.description}
                    {app.note ? ` ${app.note}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    <input
                      style={{ width: 200 }}
                      placeholder="Client ID"
                      value={oauthDraft(app.id, 'clientId')}
                      onChange={(e) => setOauthFields((k) => ({ ...k, [app.id]: { ...(k[app.id] ?? { clientId: '', clientSecret: '' }), clientId: e.target.value } }))}
                    />
                    <input
                      type="password"
                      style={{ width: 200 }}
                      placeholder="Client Secret"
                      value={oauthDraft(app.id, 'clientSecret')}
                      onChange={(e) => setOauthFields((k) => ({ ...k, [app.id]: { ...(k[app.id] ?? { clientId: '', clientSecret: '' }), clientSecret: e.target.value } }))}
                    />
                    <button className="btn small primary" disabled={isBusy(`oauth-${app.id}`)} onClick={() => void saveOAuthApp(app)}>
                      Save app
                    </button>
                    {!st?.connected && (
                      <button className="btn small" disabled={isBusy(`oauth-${app.id}`) || !st?.hasApp} onClick={() => void connectOauth(app)}>
                        Connect (Login)
                      </button>
                    )}
                    {st?.connected && (
                      <>
                        <button className="btn small" disabled={isBusy(`oauth-${app.id}`)} onClick={() => void connectOauth(app)}>
                          Re-connect
                        </button>
                        <button className="btn small" onClick={() => void disconnectOauth(app)}>
                          Disconnect
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </SettingSection>

          <SettingSection title="CRM push (manual credentials)">
            {crmCatalog.map((crm) => {
              const st = crms.find((c) => c.id === crm.id)
              const oauthReady = crm.id === 'hubspot' || crm.id === 'salesforce' ? Boolean(oauthApps.find((a) => a.id === crm.id)?.connected) : false
              return (
                <div key={crm.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ flex: 1 }}>{crm.name}</strong>
                    {oauthReady && <StatusChip ok title="connected via OAuth ✓" />}
                    {!oauthReady && st?.configured && <StatusChip ok title="configured" />}
                    {!oauthReady && st?.enabled && !st?.configured && <StatusChip ok={false} title="credentials needed" />}
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{crm.description}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                    {crm.fields.map((f) => (
                      <input
                        key={f.key}
                        type={f.secret ? 'password' : 'text'}
                        style={{ width: f.secret ? 200 : 210 }}
                        placeholder={f.label}
                        value={crmDraft(crm.id, f.key)}
                        onChange={(e) => setCrmFields((k) => ({ ...k, [crm.id]: { ...(k[crm.id] ?? {}), [f.key]: e.target.value } }))}
                      />
                    ))}
                    {!oauthReady && (
                      <>
                        <button className="btn small primary" disabled={isBusy(`crm-${crm.id}`)} onClick={() => void saveCrm(crm)}>
                          Save
                        </button>
                        <button className="btn small" disabled={isBusy(`crm-${crm.id}`) || !st?.configured} onClick={() => void testCrm(crm)}>
                          Test
                        </button>
                      </>
                    )}
                    {st?.configured && !oauthReady && (
                      <button className="btn small" onClick={() => void clearCrm(crm)}>
                        Clear
                      </button>
                    )}
                    {st && st.enabled !== undefined && (
                      <label className="muted" style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="checkbox" checked={st.enabled} onChange={() => void toggleCrm(st)} /> Enable
                      </label>
                    )}
                  </div>
                  {!oauthReady && crmTest[crm.id] && (
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                      {crmTest[crm.id].ok ? '✅ ' : '⚠️ '}
                      {crmTest[crm.id].message}
                    </div>
                  )}
                </div>
              )
            })}
          </SettingSection>
        </div>
      )}

      {tab === 'storage' && (
        <SettingSection title="Storage">
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
            All data lives in your local SQLite database under Windows AppData. It is never uploaded.
            <br />
            <div style={{ marginTop: 8 }}>
              <button className="btn small" onClick={() => void api.openExportFolder()}>
                Open exports folder
              </button>
            </div>
          </div>
        </SettingSection>
      )}
    </div>
  )
}

/* ---------------- shared bits ---------------- */

function SettingSection({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="section" style={{ marginTop: 14 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
}

function StatusChip({ ok, title }: { ok: boolean; title: string }): React.JSX.Element {
  return <span className={`chip ${ok ? 'signal' : ''}`}>{ok ? '✓ ' : ''}{title}</span>
}

function AiTab(props: {
  ai: AiSettingsView
  setAi: (a: AiSettingsView) => void
  apiKey: string
  setApiKey: (k: string) => void
  secureAvailable: boolean
  saving: boolean
  saveAi: () => Promise<void>
  testing: boolean
  testAi: () => Promise<void>
  testResult: { ok: boolean; message: string } | null
  clearAiKey: () => Promise<void>
}): React.JSX.Element {
  const { ai, setAi, apiKey, setApiKey, secureAvailable, saving, saveAi, testing, testAi, testResult, clearAiKey } = props
  const [showForm, setShowForm] = useState(!ai.baseUrl)
  const presetName = ai.preset || (ai.provider === 'anthropic' ? 'Anthropic' : 'OpenAI compatible')

  const pickPreset = (key: string): void => {
    const p = AI_PRESETS.find((x) => x.key === key)
    if (!p) return
    setAi({ ...ai, provider: p.provider, baseUrl: p.baseUrl, modelDefault: p.model, preset: p.name })
  }

  return (
    <div>
      <p className="muted" style={{ fontSize: 13 }}>
        Point Sniffer at any OpenAI-compatible or Anthropic-compatible endpoint. The key is encrypted with Windows DPAPI and never leaves
        the app. Pick a provider to pre-fill its URL & model, or edit fields directly.
      </p>

      <SettingSection title="AI gateway">
        {/* Visible status summary — always shown, editable via the pencil. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <StatusChip ok={ai.hasApiKey} title={ai.hasApiKey ? 'connected' : 'not connected'} />
          <span style={{ fontWeight: 600 }}>{presetName}</span>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {ai.baseUrl || 'no gateway URL'} · model {ai.modelDefault || '—'}
          </span>
          {!secureAvailable && <StatusChip ok={false} title="secure storage unavailable" />}
          <span style={{ flex: 1 }} />
          <button className="btn small" onClick={() => setShowForm((s) => !s)} title="Edit">
            ✎ {showForm ? 'Hide' : 'Edit'}
          </button>
        </div>

        {showForm && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 12, marginTop: 12 }}>
              <Field label="Provider">
                <select value={ai.preset || ''} onChange={(e) => pickPreset(e.target.value)}>
                  <option value="">Custom…</option>
                  {AI_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>{p.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Protocol">
                <select value={ai.provider} onChange={(e) => setAi({ ...ai, provider: e.target.value as AiSettingsView['provider'] })}>
                  <option value="openai">OpenAI compatible</option>
                  <option value="anthropic">Anthropic compatible</option>
                </select>
              </Field>
              <Field label="Gateway URL">
                <input value={ai.baseUrl} onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })} placeholder="https://…" />
              </Field>
              <Field label={ai.hasApiKey ? 'API key (blank = keep)' : 'API key'}>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={ai.hasApiKey ? '••••••••' : 'sk-…'} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
              <Field label="Default model">
                <input value={ai.modelDefault} onChange={(e) => setAi({ ...ai, modelDefault: e.target.value })} />
              </Field>
              <Field label="Research model">
                <input value={ai.modelResearch} onChange={(e) => setAi({ ...ai, modelResearch: e.target.value })} />
              </Field>
              <Field label="Writing model">
                <input value={ai.modelWriting} onChange={(e) => setAi({ ...ai, modelWriting: e.target.value })} />
              </Field>
              <Field label="Extraction model">
                <input value={ai.modelExtraction} onChange={(e) => setAi({ ...ai, modelExtraction: e.target.value })} />
              </Field>
              <Field label="Temperature">
                <input type="number" step="0.1" min="0" max="2" value={ai.temperature} onChange={(e) => setAi({ ...ai, temperature: Number(e.target.value) })} />
              </Field>
              <Field label="Max tokens">
                <input type="number" min="1" value={ai.maxTokens} onChange={(e) => setAi({ ...ai, maxTokens: Number(e.target.value) })} />
              </Field>
            </div>

            <div className="row-actions">
              <button className="btn primary" disabled={saving} onClick={() => void saveAi()}>
                {saving ? 'Saving…' : 'Save settings'}
              </button>
              <button className="btn" disabled={testing} onClick={() => void testAi()}>
                {testing ? 'Testing…' : 'Test connection'}
              </button>
              {ai.hasApiKey && (
                <button className="btn" onClick={() => void clearAiKey()}>
                  Clear key
                </button>
              )}
            </div>

            {testResult && (
              <div className="section" style={{ marginTop: 12, borderColor: testResult.ok ? 'var(--good)' : 'var(--warn)' }}>
                {testResult.ok ? '✅ ' : '⚠️ '}
                {testResult.message}
              </div>
            )}
          </>
        )}
      </SettingSection>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}

function ProviderCard(props: {
  p: ApiProviderView
  isBusy: (id: string) => boolean
  providerKeys: Record<string, string>
  setProviderKeys: (fn: (k: Record<string, string>) => Record<string, string>) => void
  providerTest: Record<string, { ok: boolean; message: string }>
  saveKey: (id: string, name: string) => Promise<void>
  clearKey: (id: string, name: string) => Promise<void>
  toggle: (id: string, enabled: boolean) => Promise<void>
  test: (id: string) => Promise<void>
}): React.JSX.Element {
  const { p } = props
  const id = p.id
  const isLinkedin = id === 'linkedin'

  if (id === 'demo') {
    return (
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ flex: 1 }}>{p.name}</strong>
          <StatusChip ok title="built-in (fictional)" />
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{p.description}</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ flex: 1 }}>{p.name}</strong>
        {p.enabled && p.hasApiKey && <StatusChip ok title="ready" />}
        {p.enabled && !p.hasApiKey && <StatusChip ok={false} title="key needed" />}
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{p.description}</div>
      <div className="chips" style={{ marginTop: 4 }}>
        {p.capabilities.map((c) => (
          <span key={c} className="chip">{c === 'search' ? 'search' : 'enrichment'}</span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
        <label className="muted" style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={p.enabled} onChange={(e) => void props.toggle(id, e.target.checked)} /> Enable
        </label>

        {isLinkedin ? (
          p.hasApiKey ? (
            <StatusChip ok title="connected via OAuth ✓" />
          ) : (
            <span className="chip">not connected — use the Connect tab</span>
          )
        ) : (
          <>
            <input
              type="password"
              style={{ width: 220 }}
              placeholder={p.hasApiKey ? 'Replace saved key…' : 'API key…'}
              value={props.providerKeys[id] ?? ''}
              onChange={(e) => props.setProviderKeys((k) => ({ ...k, [id]: e.target.value }))}
            />
            <button
              className="btn small primary"
              disabled={props.isBusy(`save-${id}`) || !(props.providerKeys[id] ?? '').trim()}
              onClick={() => void props.saveKey(id, p.name)}
            >
              Save key
            </button>
            {p.hasApiKey && (
              <button className="btn small" disabled={props.isBusy(`save-${id}`)} onClick={() => void props.clearKey(id, p.name)}>
                Clear
              </button>
            )}
            <button className="btn small" disabled={props.isBusy(`test-${id}`) || !p.hasApiKey} onClick={() => void props.test(id)}>
              Test
            </button>
          </>
        )}
      </div>

      {props.providerTest[id] && (
        <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
          {props.providerTest[id].ok ? '✅ ' : '⚠️ '}
          {props.providerTest[id].message}
        </div>
      )}
    </div>
  )
}
