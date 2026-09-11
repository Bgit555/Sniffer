import { useCallback, useEffect, useState } from 'react'
import type { AiSettingsView, ProviderSettingView } from '@shared/types'
import { api, type CrmStatus, type OAuthProviderView, type OAuthStatus } from '../lib/api'
import { useApp } from '../lib/app-context'

interface ConnCard {
  id: string
  name: string
  kind: string
  blurb: string
  status: 'connected' | 'needs' | 'off'
  connectLabel: string
}

export default function Connect(): React.JSX.Element {
  const { nav, notify } = useApp()
  const [ai, setAi] = useState<AiSettingsView | null>(null)
  const [providers, setProviders] = useState<ProviderSettingView[]>([])
  const [oauthApps, setOauthApps] = useState<OAuthStatus[]>([])
  const [oauthCat, setOauthCat] = useState<OAuthProviderView[]>([])
  const [crms, setCrms] = useState<CrmStatus[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  // per-app drafts
  const [apolloKey, setApolloKey] = useState('')
  const [apifyKey, setApifyKey] = useState('')
  const [clientIds, setClientIds] = useState<Record<string, string>>({})
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [odoo, setOdoo] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const [a, p, oa, oc, c] = await Promise.all([api.getAi(), api.providers(), api.oauthList(), api.oauthCatalog(), api.crmList()])
    setAi(a)
    setProviders(p)
    setOauthApps(oa)
    setOauthCat(oc)
    setCrms(c)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const st = (id: string): boolean => busy === id

  const provider = (id: string): ProviderSettingView | undefined => providers.find((p) => p.id === id)
  const oauth = (id: string): OAuthStatus | undefined => oauthApps.find((a) => a.id === id)
  const crm = (id: string): CrmStatus | undefined => crms.find((a) => a.id === id)

  // ---- Actions ----
  async function connectApollo(): Promise<void> {
    const key = apolloKey.trim()
    if (!key) return notify('error', 'Enter your Apollo API key.')
    await run('apollo', async () => {
      await api.saveProviderKey('apollo', key)
      setProviders(await api.providers())
      setApolloKey('')
      notify('success', 'Apollo connected for search & enrichment. Use the Test button to verify.')
    })
  }

  async function connectApify(): Promise<void> {
    const key = apifyKey.trim()
    if (!key) return notify('error', 'Enter your Apify API token.')
    await run('apify', async () => {
      await api.saveProviderKey('apify', key)
      setProviders(await api.providers())
      setApifyKey('')
      notify('success', 'Apify connected — Sniffer auto-discovers and runs actors on demand.')
    })
  }

  async function connectOauth(app: OAuthProviderView): Promise<void> {
    const stt = oauth(app.id)
    if (!stt?.hasApp) {
      const cid = (clientIds[app.id] ?? '').trim()
      const sec = (secrets[app.id] ?? '').trim()
      if (!cid) return notify('error', 'This app needs its Client ID + Secret (create the OAuth app in the provider developer console first).')
      await run(`oauth-save-${app.id}`, async () => {
        setOauthApps(await api.oauthSetApp(app.id, cid, sec))
        setClientIds((k) => ({ ...k, [app.id]: '' }))
        setSecrets((k) => ({ ...k, [app.id]: '' }))
      })
    }
    await run(`oauth-${app.id}`, async () => {
      const r = await api.oauthConnect(app.id)
      setOauthApps(await api.oauthList())
      if (app.id === 'linkedin' && r.ok) {
        await api.setProviderEnabled('linkedin', true)
        setProviders(await api.providers())
      }
      notify(r.ok ? 'success' : 'error', r.message)
    })
  }

  async function disconnectOauth(appId: string): Promise<void> {
    setOauthApps(await api.oauthDisconnect(appId))
    if (appId === 'linkedin') {
      await api.setProviderEnabled('linkedin', false)
      setProviders(await api.providers())
    }
    notify('info', 'Disconnected.')
  }

  async function connectOdoo(): Promise<void> {
    const url = (odoo.url ?? '').trim()
    const db = (odoo.db ?? '').trim()
    const login = (odoo.login ?? '').trim()
    const password = (odoo.password ?? '').trim()
    if (!url || !db || !login || !password) return notify('error', 'Odoo needs URL, database, email and password.')
    await run('odoo', async () => {
      setCrms(await api.crmSetCredential('odoo', { url, db, login, password }))
      setOdoo({})
      const res = await api.crmTest('odoo')
      notify(res.ok ? 'success' : 'error', res.message)
    })
  }

  async function testProvider(id: string, label: string): Promise<void> {
    await run(`test-${id}`, async () => {
      const r = await api.testProvider(id)
      notify(r.ok ? 'success' : 'error', r.message || `${label} OK`)
    })
  }

  const run = async (id: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(id)
    try {
      await fn()
    } catch (e) {
      notify('error', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const cards: ConnCard[] = [
    {
      id: 'apollo',
      name: 'Apollo',
      kind: 'Search & enrich',
      blurb: 'Real company & people data. Connect with your Apollo API key.',
      status: provider('apollo')?.hasApiKey ? 'connected' : 'needs',
      connectLabel: 'Apollo'
    },
    {
      id: 'apify',
      name: 'Apify',
      kind: 'Search & enrich (actors)',
      blurb: 'Run cloud scrapers. Give the token — Sniffer picks and runs the actor itself.',
      status: provider('apify')?.hasApiKey ? 'connected' : 'needs',
      connectLabel: 'Apify'
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      kind: 'Enrich & research',
      blurb: 'Login with LinkedIn. Member search needs LinkedIn partner approval.',
      status: provider('linkedin')?.hasApiKey ? 'connected' : oauth('linkedin')?.connected ? 'connected' : 'needs',
      connectLabel: 'LinkedIn'
    },
    {
      id: 'hubspot',
      name: 'HubSpot',
      kind: 'CRM',
      blurb: 'Push prospects & contacts. Login with your HubSpot app.',
      status: oauth('hubspot')?.connected ? 'connected' : 'needs',
      connectLabel: 'HubSpot'
    },
    {
      id: 'salesforce',
      name: 'Salesforce',
      kind: 'CRM',
      blurb: 'Push accounts & contacts. Login with your Salesforce app.',
      status: oauth('salesforce')?.connected ? 'connected' : 'needs',
      connectLabel: 'Salesforce'
    },
    {
      id: 'odoo',
      name: 'Odoo',
      kind: 'CRM',
      blurb: 'Push partners & contacts to Odoo via its web login.',
      status: crm('odoo')?.configured ? 'connected' : 'needs',
      connectLabel: 'Odoo'
    }
  ]

  return (
    <div>
      <div className="hero" style={{ padding: '16px 0 6px' }}>
        <h1>Connect apps</h1>
        <p>One screen, one button per app — Sniffer handles the rest. Advanced settings still live under Settings.</p>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700 }}>AI gateway</span>
          {ai?.hasApiKey ? <span className="chip signal">✓ connected</span> : <span className="chip">not connected</span>}
          <span className="muted" style={{ fontSize: 12.5 }}>
            {ai?.preset || (ai?.provider === 'anthropic' ? 'Anthropic' : ai?.baseUrl ? 'OpenAI compatible' : 'not configured')}
            {ai?.baseUrl ? ` · ${ai.baseUrl}` : ''}
            {ai?.modelDefault ? ` · ${ai.modelDefault}` : ''}
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn small" onClick={() => nav.go({ name: 'settings' })} title="Edit">
            ✎ Edit
          </button>
        </div>
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        {cards.map((c) => (
          <div className="card" key={c.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, flex: 1 }}>{c.name}</span>
              {c.status === 'connected' ? (
                <span className="chip signal">✓ connected</span>
              ) : (
                <span className="chip">not connected</span>
              )}
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{c.kind}</div>
            <div className="desc">{c.blurb}</div>

            {c.id === 'apollo' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                <input type="password" style={{ flex: 1, minWidth: 160 }} placeholder="Apollo API key" value={apolloKey} onChange={(e) => setApolloKey(e.target.value)} />
                <button className="btn primary small" disabled={st('apollo')} onClick={() => void connectApollo()}>Connect</button>
                {provider('apollo')?.hasApiKey && <button className="btn small" disabled={st('test-apollo')} onClick={() => void testProvider('apollo', 'Apollo')}>Test</button>}
              </div>
            )}

            {c.id === 'apify' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                <input type="password" style={{ flex: 1, minWidth: 160 }} placeholder="Apify API token" value={apifyKey} onChange={(e) => setApifyKey(e.target.value)} />
                <button className="btn primary small" disabled={st('apify')} onClick={() => void connectApify()}>Connect</button>
                {provider('apify')?.hasApiKey && <button className="btn small" disabled={st('test-apify')} onClick={() => void testProvider('apify', 'Apify')}>Test</button>}
              </div>
            )}

            {(c.id === 'linkedin' || c.id === 'hubspot' || c.id === 'salesforce') && (
              <div style={{ marginTop: 8 }}>
                {oauth(c.id)?.connected ? (
                  <div className="row-actions">
                    <button className="btn small" disabled={st(`oauth-${c.id}`)} onClick={() => void reconnectOauth(c.id)}>Re-connect</button>
                    <button className="btn small" onClick={() => void disconnectOauth(c.id)}>Disconnect</button>
                  </div>
                ) : oauth(c.id)?.hasApp ? (
                  <button className="btn primary small" disabled={st(`oauth-${c.id}`)} onClick={() => void connectOauth(byId(c.id))}>
                    Login with {c.name}
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <input style={{ flex: 1, minWidth: 150 }} placeholder="Client ID (create OAuth app)" value={clientIds[c.id] ?? ''} onChange={(e) => setClientIds((k) => ({ ...k, [c.id]: e.target.value }))} />
                    <input type="password" style={{ flex: 1, minWidth: 150 }} placeholder="Client Secret" value={secrets[c.id] ?? ''} onChange={(e) => setSecrets((k) => ({ ...k, [c.id]: e.target.value }))} />
                    <button className="btn primary small" disabled={st(`oauth-${c.id}`)} onClick={() => void connectOauth(byId(c.id))}>Connect</button>
                  </div>
                )}
                {c.id === 'linkedin' && !oauth('linkedin')?.connected && (
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>LinkedIn blocks member search until your app is partner-approved.</div>
                )}
              </div>
            )}

            {c.id === 'odoo' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {(['url', 'db', 'login', 'password'] as const).map((f) => (
                  <input
                    key={f}
                    type={f === 'password' ? 'password' : 'text'}
                    style={{ width: 150 }}
                    placeholder={f === 'url' ? 'https://your.odoo.com' : f === 'db' ? 'database' : f === 'login' ? 'email' : 'password'}
                    value={odoo[f] ?? ''}
                    onChange={(e) => setOdoo((o) => ({ ...o, [f]: e.target.value }))}
                  />
                ))}
                <button className="btn primary small" disabled={st('odoo')} onClick={() => void connectOdoo()}>Connect & test</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
        Tip: once connected, run <strong>Autopilot</strong> — it chooses the source and does search → save → enrich → analyze by itself. Manual
        tokens, actors and advanced toggles remain under <strong>Settings</strong>.
      </div>
    </div>
  )

  function byId(id: string): OAuthProviderView {
    return oauthCat.find((o) => o.id === id)!
  }

  async function reconnectOauth(id: string): Promise<void> {
    await run(`oauth-${id}`, async () => {
      const r = await api.oauthConnect(id)
      setOauthApps(await api.oauthList())
      notify(r.ok ? 'success' : 'error', r.message)
    })
  }
}
