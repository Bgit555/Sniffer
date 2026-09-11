import { useCallback, useEffect, useState } from 'react'
import type { AnalysisView, CompanyView, OutreachView } from '@shared/types'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import SaveToList from '../components/SaveToList'
import { copyText } from '../lib/clipboard'

const TYPE_LABEL: Record<string, string> = {
  funding: '💸 Funding',
  hiring: '🧑‍💻 Hiring',
  expansion: '🌍 Expansion',
  leadership: '👔 Leadership',
  product: '🚀 Product',
  recent_funding: '💸 Funding'
}

export default function Company({ id }: { id: number }): React.JSX.Element {
  const { nav, notify } = useApp()
  const [company, setCompany] = useState<CompanyView | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [showOutreach, setShowOutreach] = useState(false)
  const [outreach, setOutreach] = useState<OutreachView | null>(null)
  const [form, setForm] = useState({ personId: '', channel: 'email', tone: 'Professional', offer: '' })
  const [generating, setGenerating] = useState(false)
  const [pushingCrm, setPushingCrm] = useState(false)
  const [enrichMethod, setEnrichMethod] = useState<'auto' | 'providers' | 'web' | 'ai'>('auto')
  const [intel, setIntel] = useState<{ key: string; label: string; result: string }[]>([])
  const [intelBusy, setIntelBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const c = await api.getCompany(id)
      setCompany(c)
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Failed to load company.')
    } finally {
      setLoading(false)
    }
  }, [id, notify])

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: string, fn: () => Promise<CompanyView>): Promise<void> {
    setBusyAction(action)
    try {
      const updated = await fn()
      setCompany(updated)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      notify('error', msg)
      if (/AI is not configured/i.test(msg)) nav.go({ name: 'settings' })
    } finally {
      setBusyAction(null)
    }
  }

  async function enrich(): Promise<void> {
    setBusyAction('enrich')
    try {
      const res = await api.enrichCompany(id, enrichMethod)
      setCompany(res.company)
      notify('success', res.note)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      notify('error', msg)
      if (/AI is not configured/i.test(msg)) nav.go({ name: 'settings' })
    } finally {
      setBusyAction(null)
    }
  }

  async function pushToCrm(): Promise<void> {
    setPushingCrm(true)
    try {
      const results = await api.crmPushCompany(id)
      if (results.length === 0) {
        notify('info', 'No CRM enabled. Add one under Settings → CRM connections first.')
      } else {
        for (const r of results) notify(r.ok ? 'success' : 'error', r.message)
      }
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Push failed.')
    } finally {
      setPushingCrm(false)
    }
  }

  async function runBrief(label: string, prompt: string): Promise<void> {
    setIntelBusy(label)
    try {
      const run = await api.promptRun({ companyId: id, adhocTitle: `${label} — ${company?.name}`, adhocPrompt: prompt })
      setIntel((prev) => [{ key: `${label}-${run.id}`, label, result: run.result }, ...prev].slice(0, 5))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      notify('error', msg)
      if (/AI is not configured/i.test(msg)) nav.go({ name: 'settings' })
    } finally {
      setIntelBusy(null)
    }
  }

  async function generate(): Promise<void> {
    setGenerating(true)
    try {
      const result = await api.generateOutreach({
        companyId: id,
        personId: form.personId ? Number(form.personId) : null,
        channel: form.channel,
        tone: form.tone,
        offer: form.offer
      })
      setOutreach(result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      notify('error', msg)
      if (/AI is not configured/i.test(msg)) nav.go({ name: 'settings' })
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="center">
        <span className="spinner" /> Loading…
      </div>
    )
  }

  if (!company) {
    return <div className="empty">Company not found.</div>
  }

  const analysis = company.analysis

  return (
    <div>
      <button className="btn ghost small" onClick={() => nav.go({ name: 'home' })}>
        ← Back
      </button>

      <div className="detail-head" style={{ marginTop: 12 }}>
        <div className="avatar big">{company.name[0]?.toUpperCase() ?? '•'}</div>
        <div style={{ flex: 1 }}>
          <h2>{company.name}</h2>
          <div className="sub">
            {[company.industry, [company.city, company.country].filter(Boolean).join(', '), company.employeeCount ? `${company.employeeCount.toLocaleString()} employees` : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {company.website && (
            <div className="sub">
              <a href={company.website} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                {company.website.replace(/^https?:\/\//, '')}
              </a>
            </div>
          )}
        </div>
        {analysis && <ScoreBadge score={analysis.fitScore} />}
      </div>

      <div className="row-actions" style={{ marginTop: 18 }}>
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <select value={enrichMethod} onChange={(e) => setEnrichMethod(e.target.value as typeof enrichMethod)} title="Enrich method">
            <option value="auto">Auto (provider → web → AI)</option>
            <option value="providers">Providers only</option>
            <option value="web">Web scrape only</option>
            <option value="ai">AI only</option>
          </select>
          <button className="btn" disabled={busyAction === 'enrich'} onClick={() => void enrich()}>
            {busyAction === 'enrich' ? 'Enriching…' : company.people.length ? 'Re-enrich contacts' : 'Enrich'}
          </button>
        </span>
        <button className="btn" disabled={busyAction === 'analyze'} onClick={() => void run('analyze', () => api.analyzeCompany(id))}>
          {busyAction === 'analyze' ? 'Analyzing…' : analysis ? 'Re-analyze' : 'Analyze with AI'}
        </button>
        <button className="btn" disabled={busyAction !== null} onClick={() => setShowOutreach((s) => !s)}>
          Generate outreach
        </button>
        <button className="btn" disabled={pushingCrm} onClick={() => void pushToCrm()}>
          {pushingCrm ? 'Pushing…' : 'Push to CRM'}
        </button>
        <SaveToList companyIds={[id]} />
      </div>

      {company.description && (
        <div className="section">
          <p style={{ margin: 0, lineHeight: 1.6 }}>{company.description}</p>
        </div>
      )}

      <div className="section">
        <h3>Recent signals</h3>
        {company.signals.length === 0 && <p className="muted">No signals detected yet.</p>}
        {company.signals.map((s) => (
          <div className="list-row" key={s.id}>
            <div>
              <div>
                <span className="chip signal" style={{ marginRight: 8 }}>{TYPE_LABEL[s.type] ?? s.type}</span>
                <strong>{s.title}</strong>
              </div>
              {s.summary && <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{s.summary}</div>}
            </div>
            {s.publishedAt && <span className="muted" style={{ fontSize: 12 }}>{new Date(s.publishedAt).toLocaleDateString()}</span>}
          </div>
        ))}
      </div>

      <div className="section">
        <h3>Contacts {company.people.length > 0 && <span className="muted" style={{ textTransform: 'none' }}>— {company.people.length}</span>}</h3>
        {company.people.length === 0 && (
          <p className="muted">
            No contacts yet. Run <strong>Enrich</strong> to find realistic decision-makers (demo).
          </p>
        )}
        {company.people.map((p) => (
          <div className="list-row" key={p.id}>
            <div>
              <div>
                <strong>{[p.firstName, p.lastName].filter(Boolean).join(' ') || p.title}</strong>
                {(p.firstName || p.lastName) && (
                  <span className="muted" style={{ marginLeft: 8 }}>{p.title}</span>
                )}
                {p.emailStatus === 'unknown' && (
                  <span className="chip" style={{ marginLeft: 8 }}>AI-estimated role</span>
                )}
                {p.emailStatus === 'scraped' && (
                  <span className="chip" style={{ marginLeft: 8 }}>scraped from web</span>
                )}
              </div>
              {p.email && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{p.email}</div>}
            </div>
            {p.email && (
              <button className="btn small" onClick={() => void copyEmail(p.email as string, notify)}>
                Copy email
              </button>
            )}
          </div>
        ))}
      </div>

      {analysis && <AnalysisSection analysis={analysis} />}

      <div className="section">
        <h3>AI briefs</h3>
        <div className="row-actions">
          <button className="btn" disabled={intelBusy !== null} onClick={() => void runBrief('Meeting brief', MEETING_BRIEF)}>
            {intelBusy === 'Meeting brief' ? 'Working…' : '🗓 Meeting brief'}
          </button>
          <button className="btn" disabled={intelBusy !== null} onClick={() => void runBrief('Research brief', RESEARCH_BRIEF)}>
            {intelBusy === 'Research brief' ? 'Working…' : '🔍 Research brief'}
          </button>
          <button className="btn" disabled={intelBusy !== null} onClick={() => void runBrief('Approach', APPROACH_BRIEF)}>
            {intelBusy === 'Approach' ? 'Working…' : '🎯 Recommended approach'}
          </button>
          <button className="btn" disabled={intelBusy !== null} onClick={() => void runBrief('Audit report', AUDIT_REPORT_BRIEF)}>
            {intelBusy === 'Audit report' ? 'Working…' : '📋 Audit report'}
          </button>
          <button className="btn" disabled={intelBusy !== null} onClick={() => void runBrief('SPIN script', SPIN_SCRIPT_BRIEF)}>
            {intelBusy === 'SPIN script' ? 'Working…' : '🎙 SPIN interview script'}
          </button>
          <span className="muted" style={{ alignSelf: 'center', fontSize: 12 }}>Runs via your AI gateway (see Prompt Library → Runs)</span>
        </div>
        {intel.map((b) => (
          <div key={b.key} style={{ marginTop: 12 }}>
            <strong>{b.label}</strong>
            <div className="outreach-msg">{b.result}</div>
            <button className="btn small" style={{ marginTop: 8 }} onClick={() => void copyText(b.result).then((ok) => notify(ok ? 'success' : 'error', ok ? 'Copied.' : 'Copy failed.'))}>
              Copy
            </button>
          </div>
        ))}
      </div>

      {showOutreach && (
        <div className="section">
          <h3>Generate outreach</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
            <div className="field">
              <label>Contact</label>
              <select value={form.personId} onChange={(e) => setForm((f) => ({ ...f, personId: e.target.value }))}>
                <option value="">Company-level (no person)</option>
                {company.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {[p.firstName, p.lastName].filter(Boolean).join(' ')} — {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Channel</label>
              <select value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}>
                <option value="email">Email</option>
                <option value="linkedin">LinkedIn</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>
            <div className="field">
              <label>Tone</label>
              <select value={form.tone} onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value }))}>
                <option>Professional</option>
                <option>Casual</option>
                <option>Confident</option>
                <option>Curious</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>What do you offer? (used only as context)</label>
            <textarea
              rows={2}
              placeholder="e.g. We build AI agents that help B2B marketing teams launch campaigns in days"
              value={form.offer}
              onChange={(e) => setForm((f) => ({ ...f, offer: e.target.value }))}
            />
          </div>
          <button className="btn primary" disabled={generating} onClick={() => void generate()}>
            {generating ? 'Generating…' : 'Generate message'}
          </button>

          {outreach && (
            <div>
              <div className="outreach-msg">{outreach.message}</div>
              <div className="row-actions" style={{ marginTop: 10 }}>
                <button className="btn small primary" onClick={() => void copyAndNotify(outreach.message, notify)}>
                  Copy message
                </button>
                {outreach.model && <span className="muted" style={{ alignSelf: 'center', fontSize: 12 }}>via {outreach.model}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ScoreBadge({ score }: { score: number | null }): React.JSX.Element {
  if (score === null || score === undefined) return <span />
  const cls = score >= 65 ? 'high' : score >= 40 ? 'mid' : ''
  return <span className={`badge-score ${cls}`} style={{ minWidth: 46, height: 46, fontSize: 17 }}>{score}</span>
}

function AnalysisSection({ analysis }: { analysis: AnalysisView }): React.JSX.Element {
  return (
    <div className="section">
      <h3>AI analysis</h3>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px' }}>
          <strong>Why it fits</strong>
          <ul style={{ margin: '8px 0 16px', paddingLeft: 18 }}>
            {analysis.whyFit.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          {analysis.painPoints.length > 0 && (
            <>
              <strong>Likely pain points</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {analysis.painPoints.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div style={{ flex: '1 1 300px' }}>
          {analysis.recommendedAngle && (
            <>
              <strong>Recommended angle</strong>
              <p className="muted" style={{ marginTop: 6 }}>{analysis.recommendedAngle}</p>
            </>
          )}
          {analysis.personalizationHooks.length > 0 && (
            <>
              <strong>Personalization hooks</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {analysis.personalizationHooks.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </>
          )}
          {analysis.rubric && (
            <div style={{ marginTop: 16 }}>
              <strong>Qualification</strong>
              <div style={{ marginTop: 6 }}>
                <RubricBar label="Digital presence" value={analysis.rubric.digitalPresence} />
                <RubricBar label="Social activity" value={analysis.rubric.socialActivity} />
                <RubricBar label="Industry fit" value={analysis.rubric.industryFit} />
                <RubricBar label="Scale potential" value={analysis.rubric.scalePotential} />
              </div>
              {analysis.rubric.notes.length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {analysis.rubric.notes.map((n, i) => (
                    <li key={i} className="muted">{n}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
            {analysis.model ? `Model: ${analysis.model}` : 'Automated analysis (AI gateway not configured)'} ·{' '}
            {new Date(analysis.createdAt).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}

function RubricBar({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span className="muted" style={{ width: 130, fontSize: 12 }}>{label}</span>
      <progress value={value} max={100} style={{ flex: 1, height: 8 }} />
      <span style={{ width: 32, textAlign: 'right', fontSize: 12 }}>{value}</span>
    </div>
  )
}

async function copyEmail(email: string, notify: (k: 'info' | 'error' | 'success', m: string) => void): Promise<void> {
  const ok = await copyText(email)
  notify(ok ? 'success' : 'error', ok ? 'Email copied.' : 'Could not copy.')
}

async function copyAndNotify(text: string, notify: (k: 'info' | 'error' | 'success', m: string) => void): Promise<void> {
  const ok = await copyText(text)
  notify(ok ? 'success' : 'error', ok ? 'Message copied.' : 'Could not copy.')
}

const MEETING_BRIEF = `Prepare a concise meeting brief about {{company.name}}.

Context:
- Company: {{company.name}} ({{company.industry}})
- About: {{company.description}}
- Recent signals: {{company.recent_signal}}
- Website: {{company.website}}

Give: overview (3 bullets), likely goals and pressure points (2), and 4 conversation-starting questions. Use ONLY this context.`

const RESEARCH_BRIEF = `Summarise what we know about {{company.name}} ({{company.industry}}).

Description: {{company.description}}
Signals: {{company.recent_signal}}
Website: {{company.website}}

Return a short structured brief: overview, what stands out, what we still don't know. Do not invent details.`

const APPROACH_BRIEF = `How should we approach {{company.name}}?

Context: {{company.industry}} — {{company.description}}
Recent signal: {{company.recent_signal}}

Give a recommended angle and 3 concrete, evidence-based hooks to open a conversation. Use ONLY this context.`

const AUDIT_REPORT_BRIEF = `Write a short, evidence-based digital audit report for {{company.name}} ({{company.industry}}).

About: {{company.description}}
Signals: {{company.recent_signal}}
Website: {{company.website}}

Structure in markdown:
1. What we observed (2-3 bullets, only from the facts above)
2. Likely challenges / gaps (2-3)
3. How we could help (2-3 concrete, tied to the gaps)
4. Next step (one call-to-action line)
Do NOT invent facts, names, metrics or URLs.`

const SPIN_SCRIPT_BRIEF = `Write a conversational SPIN interview script for a call with {{company.name}} ({{company.industry}}).

About: {{company.description}}
Recent signal: {{company.recent_signal}}

Include sections: Introduction, Personalized hook, Situation questions, Problem questions, Implication questions, Need-payoff questions, Closing. Keep questions specific to this company and its likely challenges. Do NOT invent facts.`
