import { useCallback, useEffect, useState } from 'react'
import type { CompanyView } from '@shared/types'
import { api, type PromptRunView, type PromptTemplateView } from '../lib/api'
import { useApp } from '../lib/app-context'
import { copyText } from '../lib/clipboard'

const MODEL_LABEL: Record<string, string> = { writing: 'Writing', research: 'Research', extraction: 'Extraction' }
const VAR_LABEL: Record<string, string> = {
  'company.name': 'Company',
  'company.industry': 'Industry',
  'company.description': 'Description',
  'company.recent_signal': 'Recent signal',
  'person.first_name': 'First name',
  'person.title': 'Title',
  'user.offer': 'Your offer'
}
const CATEGORY_SUGGESTIONS = ['Personalize Outreach', 'Meeting Prep', 'Research', 'Enrichment', 'Recruiting', 'Competitive Intelligence', 'Build Lead Lists']

type Tab = 'browse' | 'builder' | 'runs'

export default function PromptLibrary(): React.JSX.Element {
  const { notify } = useApp()
  const [tab, setTab] = useState<Tab>('browse')
  const [templates, setTemplates] = useState<PromptTemplateView[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [category, setCategory] = useState('')
  const [runs, setRuns] = useState<PromptRunView[]>([])
  const [runner, setRunner] = useState<PromptTemplateView | null>(null)
  const [editing, setEditing] = useState<PromptTemplateView | 'new' | null>(null)

  const load = useCallback(async () => {
    try {
      const [t, c, r] = await Promise.all([api.promptList(category || undefined), api.promptCategories(), api.promptRuns(20)])
      setTemplates(t)
      setCategories(c)
      setRuns(r)
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Failed to load prompts.')
    }
  }, [category, notify])

  useEffect(() => {
    void load()
  }, [load])

  async function removeTemplate(t: PromptTemplateView): Promise<void> {
    if (!window.confirm(`Delete prompt "${t.title}"?`)) return
    await api.promptDelete(t.id)
    notify('success', 'Prompt deleted.')
    void load()
  }

  async function duplicate(t: PromptTemplateView): Promise<void> {
    try {
      await api.promptCreate({ title: `${t.title} (copy)`, description: t.description, category: t.category, template: t.template, variables: t.variables, modelProfile: t.modelProfile })
      notify('success', 'Duplicated.')
      void load()
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Duplicate failed.')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2>Prompt library</h2>
          <p className="muted" style={{ marginTop: -6 }}>
            Reusable prompts with <code>{'{{company.name}}'}</code> / <code>{'{{person.first_name}}'}</code> / <code>{'{{user.offer}}'}</code>{' '}
            variables — run against any saved prospect.
          </p>
        </div>
        <div className="row-actions">
          {(['browse', 'builder', 'runs'] as Tab[]).map((t) => (
            <button key={t} className={`btn ${tab === t ? 'primary' : ''}`} onClick={() => { setTab(t); setEditing(null) }}>
              {t === 'browse' ? 'Templates' : t === 'builder' ? 'New prompt' : `Runs (${runs.length})`}
            </button>
          ))}
        </div>
      </div>

      {tab === 'browse' && (
        <>
          <div className="chips" style={{ margin: '14px 0 6px' }}>
            <button className={`pill ${category === '' ? 'accent' : ''}`} onClick={() => setCategory('')}>All</button>
            {categories.map((c) => (
              <button key={c} className={`pill ${category === c ? 'accent' : ''}`} onClick={() => setCategory(c)}>{c}</button>
            ))}
          </div>
          {templates.length === 0 ? (
            <div className="empty">No prompts in this category yet.</div>
          ) : (
            <div className="grid" style={{ marginTop: 12 }}>
              {templates.map((t) => (
                <div className="card" key={t.id}>
                  <div className="company-name">{t.title}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                    {[t.category, MODEL_LABEL[t.modelProfile ?? ''] ?? 'Writing', t.usageCount > 0 ? `used ${t.usageCount}×` : null].filter(Boolean).join(' · ')}
                  </div>
                  {t.description && <div className="desc">{t.description}</div>}
                  <div className="chips">
                    {(t.variables ?? []).map((v) => (
                      <span key={v} className="chip accent">{VAR_LABEL[v] ?? v}</span>
                    ))}
                  </div>
                  <div className="row-actions" style={{ marginTop: 12 }}>
                    <button className="btn primary small" onClick={() => setRunner(t)}>Run</button>
                    <button className="btn small" onClick={() => { setEditing(t); setTab('builder') }}>Edit</button>
                    <button className="btn small" onClick={() => void duplicate(t)}>Duplicate</button>
                    <button className="btn small" onClick={() => void removeTemplate(t)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'builder' && (
        <Builder
          key={editing === null ? 'new' : editing === 'new' ? 'blank' : `edit-${editing.id}`}
          initial={editing && editing !== 'new' ? editing : null}
          onSaved={() => { setEditing(null); setTab('browse'); void load() }}
          onCancel={() => { setEditing(null); setTab('browse') }}
        />
      )}

      {tab === 'runs' && <Runs runs={runs} onRefresh={() => void load()} />}

      {runner && <Runner key={runner.id} template={runner} onClose={() => setRunner(null)} onRan={() => void load()} />}
    </div>
  )
}

/* ---------------- Saved companies helper ---------------- */

function useSavedCompanies(): { companies: CompanyView[]; loading: boolean } {
  const [companies, setCompanies] = useState<CompanyView[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const lists = await api.lists()
        const seen = new Map<number, CompanyView>()
        for (const l of lists) {
          const members = await api.listCompanies(l.id)
          for (const c of members) if (!seen.has(c.id)) seen.set(c.id, c)
        }
        if (alive) setCompanies([...seen.values()])
      } catch {
        /* ignore */
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])
  return { companies, loading }
}

function Runner({ template, onClose, onRan }: { template: PromptTemplateView; onClose: () => void; onRan: () => void }): React.JSX.Element {
  const { notify } = useApp()
  const { companies, loading } = useSavedCompanies()
  const [companyId, setCompanyId] = useState<number | ''>('')
  const [personId, setPersonId] = useState<number | ''>('')
  const [people, setPeople] = useState<CompanyView['people']>([])
  const [offer, setOffer] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PromptRunView | null>(null)
  const [error, setError] = useState<string | null>(null)

  const company = companies.find((c) => c.id === companyId) ?? null

  useEffect(() => {
    setPersonId('')
    setPeople(company ? company.people : [])
  }, [companyId, company])

  async function run(): Promise<void> {
    if (companyId === '') {
      notify('error', 'Pick a saved prospect to run this prompt against.')
      return
    }
    setBusy(true)
    setResult(null)
    setError(null)
    try {
      const out = await api.promptRun({
        promptId: template.id,
        companyId: companyId as number,
        personId: personId === '' ? null : (personId as number),
        offer
      })
      setResult(out)
      notify('success', 'Prompt ran.')
      onRan()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Run failed.'
      setError(msg)
      notify('error', msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="section" style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0 }}>Run — {template.title}</h3>
        <button className="btn small" onClick={onClose}>Close</button>
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 4, whiteSpace: 'pre-wrap' }}>{template.template}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginTop: 14 }}>
        <div className="field">
          <label>Prospect</label>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">{loading ? 'Loading saved prospects…' : 'Choose a saved prospect…'}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {companies.length === 0 && !loading && (
            <span className="muted" style={{ fontSize: 11.5 }}>Save prospects to a list first to run prompts against them.</span>
          )}
        </div>
        <div className="field">
          <label>Contact (optional)</label>
          <select value={personId} onChange={(e) => setPersonId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">No specific contact</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{[p.firstName, p.lastName].filter(Boolean).join(' ')} — {p.title}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Your offer (optional context)</label>
          <input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="What you sell / do" />
        </div>
      </div>

      <button className="btn primary" disabled={busy || companyId === ''} onClick={() => void run()}>
        {busy ? 'Running…' : 'Run prompt'}
      </button>

      {error && (
        <div className="section" style={{ marginTop: 12, borderColor: 'var(--warn)' }}>
          ⚠ {error}
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Check Settings → AI gateway (URL, provider protocol, model name) then Test connection.
          </div>
        </div>
      )}

      {result && (
        <div style={{ marginTop: 16 }}>
          <div className="outreach-msg">{result.result}</div>
          <div className="row-actions" style={{ marginTop: 10 }}>
            <button className="btn small primary" onClick={() => void copyText(result.result).then((ok) => notify(ok ? 'success' : 'error', ok ? 'Copied.' : 'Copy failed.'))}>
              Copy result
            </button>
            {result.model && <span className="muted" style={{ alignSelf: 'center', fontSize: 12 }}>via {result.model}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- Builder ---------------- */

function Builder({ initial, onSaved, onCancel }: { initial: PromptTemplateView | null; onSaved: () => void; onCancel: () => void }): React.JSX.Element {
  const { notify } = useApp()
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    category: initial?.category ?? 'Research',
    modelProfile: initial?.modelProfile ?? 'writing',
    template: initial?.template ?? ''
  })
  const [variable, setVariable] = useState('')
  const [variables, setVariables] = useState<string[]>(initial?.variables ?? [])
  const [saving, setSaving] = useState(false)

  async function save(): Promise<void> {
    if (!form.title.trim() || !form.template.trim()) {
      notify('error', 'Title and template are required.')
      return
    }
    setSaving(true)
    try {
      if (initial) {
        await api.promptUpdate(initial.id, { ...form, variables })
      } else {
        await api.promptCreate({ ...form, variables })
      }
      notify('success', initial ? 'Prompt updated.' : 'Prompt created.')
      onSaved()
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  function addVariable(): void {
    const v = variable.trim().toLowerCase()
    if (v && !variables.includes(v)) setVariables([...variables, v])
    setVariable('')
  }

  return (
    <div className="section" style={{ marginTop: 16 }}>
      <h3>{initial ? 'Edit prompt' : 'New prompt'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        <div className="field">
          <label>Title</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="field">
          <label>Category</label>
          <select value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORY_SUGGESTIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Model profile</label>
          <select value={form.modelProfile ?? 'writing'} onChange={(e) => setForm({ ...form, modelProfile: e.target.value })}>
            <option value="writing">Writing</option>
            <option value="research">Research</option>
            <option value="extraction">Extraction</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Description</label>
        <input value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="field">
        <label>Template</label>
        <textarea
          rows={9}
          value={form.template}
          onChange={(e) => setForm({ ...form, template: e.target.value })}
          placeholder="Write your prompt. Insert variables like {{company.name}}, {{person.first_name}}, {{user.offer}}…"
        />
      </div>
      <div className="field">
        <label>Declared variables</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {variables.map((v) => (
            <span key={v} className="chip accent">
              {v} <button className="ghost-chip" onClick={() => setVariables(variables.filter((x) => x !== v))}>×</button>
            </span>
          ))}
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <input style={{ width: 170 }} value={variable} onChange={(e) => setVariable(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addVariable()} placeholder="company.name" />
            <button className="btn small" onClick={addVariable}>Add</button>
          </span>
        </div>
      </div>
      <div className="row-actions">
        <button className="btn primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Create prompt'}
        </button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

/* ---------------- Runs ---------------- */

function Runs({ runs, onRefresh }: { runs: PromptRunView[]; onRefresh: () => void }): React.JSX.Element {
  const { nav, notify } = useApp()
  if (runs.length === 0) {
    return (
      <div className="empty">
        No runs yet.
        <br />
        <span className="muted">Run a prompt against a prospect and the results will appear here.</span>
      </div>
    )
  }
  return (
    <div style={{ marginTop: 16 }}>
      {runs.map((r) => (
        <div className="section" key={r.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <strong>{r.title}</strong>
              {r.companyName && (
                <button className="ghost-chip" style={{ marginLeft: 8 }} onClick={() => r.companyId && nav.openCompany(r.companyId)}>
                  {r.companyName} ↗
                </button>
              )}
            </div>
            <span className="muted" style={{ fontSize: 12 }}>{new Date(r.createdAt).toLocaleString()}{r.model ? ` · ${r.model}` : ''}</span>
          </div>
          <div className="outreach-msg">{r.result}</div>
          <div className="row-actions" style={{ marginTop: 8 }}>
            <button className="btn small primary" onClick={() => void copyText(r.result).then((ok) => notify(ok ? 'success' : 'error', ok ? 'Copied.' : 'Copy failed.'))}>
              Copy
            </button>
            <button className="btn small" onClick={onRefresh}>Refresh</button>
          </div>
        </div>
      ))}
    </div>
  )
}
