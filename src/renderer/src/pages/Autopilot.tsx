import { useEffect, useRef, useState } from 'react'
import { api, subscribe, type AutopilotLog, type AutopilotSummary } from '../lib/api'
import { useApp } from '../lib/app-context'

const EXAMPLES = [
  'Find US SaaS companies with 50–200 employees hiring marketing leaders, enrich the decision makers and score them',
  'Find fintech companies in the UK that recently raised funding and prepare outreach angles'
]

export default function Autopilot(): React.JSX.Element {
  const { nav, notify } = useApp()
  const [task, setTask] = useState('')
  const [busy, setBusy] = useState(false)
  const [lines, setLines] = useState<string[]>([])
  const [summary, setSummary] = useState<AutopilotSummary | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return subscribe<AutopilotLog>('autopilot:log', (e) => {
      setLines((prev) => [...prev, e.line])
    })
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight)
  }, [lines])

  async function run(): Promise<void> {
    const t = task.trim()
    if (!t || busy) return
    setBusy(true)
    setLines([])
    setSummary(null)
    try {
      const s = await api.autopilotRun(t)
      setSummary(s)
      if (!s.ok) notify('error', s.errors[0] ?? 'Autopilot could not complete.')
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Autopilot failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="hero" style={{ padding: '20px 0 8px' }}>
        <h1>Autopilot</h1>
        <p>Describe the outcome — Sniffer decides the source, finds the actor it needs, and runs the whole flow.</p>
      </div>

      <div className="search-box">
        <textarea
          rows={3}
          placeholder="e.g. Find US SaaS companies with 50–200 employees hiring marketing leaders, enrich and score them"
          value={task}
          onChange={(e) => setTask(e.target.value)}
        />
        <button className="go" disabled={busy || !task.trim()} onClick={() => void run()}>
          {busy ? 'Running…' : 'Run Autopilot'}
        </button>
      </div>

      <div className="templates">
        {EXAMPLES.map((ex) => (
          <button key={ex} className="pill" onClick={() => setTask(ex)}>
            {ex}
          </button>
        ))}
      </div>

      {busy && (
        <div className="center">
          <span className="spinner" /> Autopilot is working — it may run searches, pick an actor, enrich and score…
        </div>
      )}

      {lines.length > 0 && (
        <div className="section" style={{ marginTop: 18 }}>
          <h3>Live log</h3>
          <div ref={logRef} className="outreach-msg" style={{ maxHeight: 260, overflowY: 'auto', fontFamily: 'Consolas, monospace', fontSize: 12.5 }}>
            {lines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </div>
      )}

      {summary && (
        <div className="section" style={{ marginTop: 14 }}>
          <h3>Result</h3>
          <div className="chips" style={{ marginBottom: 10 }}>
            <span className="chip accent">{summary.companiesFound} found</span>
            <span className="chip accent">{summary.companiesEnriched} enriched</span>
            <span className="chip accent">{summary.companiesAnalyzed} analyzed</span>
            {summary.sources.map((s) => (
              <span key={s.id} className="chip">{s.demo ? 'demo' : s.name}</span>
            ))}
          </div>
          {summary.errors.length > 0 && (
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
              {summary.errors.map((e, i) => (
                <div key={i}>⚠ {e}</div>
              ))}
            </div>
          )}
          {summary.listId && (
            <button className="btn primary" onClick={() => nav.go({ name: 'list', id: summary.listId! })}>
              Open saved list → {summary.listName}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
