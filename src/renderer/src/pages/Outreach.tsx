import { useCallback, useEffect, useState } from 'react'
import type { OutreachView } from '@shared/types'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { copyText } from '../lib/clipboard'

const CHANNEL_ICON: Record<string, string> = { email: '✉', linkedin: 'in', whatsapp: 'wa' }

export default function Outreach(): React.JSX.Element {
  const { nav, notify } = useApp()
  const [history, setHistory] = useState<OutreachView[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    api
      .outreachHistory()
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <h2>Outreach</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        Drafts you’ve generated. Nothing is sent automatically — copy a message and send it yourself.
      </p>

      {loading ? (
        <div className="center">
          <span className="spinner" /> Loading…
        </div>
      ) : history.length === 0 ? (
        <div className="empty">
          No outreach drafts yet.
          <br />
          <span className="muted">Open a prospect you’ve analysed and click “Generate outreach”.</span>
          <div style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={() => nav.go({ name: 'lists' })}>
              Browse saved prospects
            </button>
          </div>
        </div>
      ) : (
        history.map((h) => (
          <div className="section" key={h.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div>
                <span className="chip accent" style={{ marginRight: 8 }}>
                  {CHANNEL_ICON[h.channel] ?? h.channel} {h.channel}
                </span>
                <strong>{h.companyName ?? 'Company'}</strong>
                {h.personName && <span className="muted" style={{ marginLeft: 6 }}>to {h.personName}</span>}
              </div>
              <span className="muted" style={{ fontSize: 12 }}>
                {new Date(h.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="outreach-msg">{h.message}</div>
            <div style={{ marginTop: 10 }}>
              <button
                className="btn small primary"
                onClick={() => void copyText(h.message).then((ok) => notify(ok ? 'success' : 'error', ok ? 'Message copied.' : 'Could not copy.'))}
              >
                Copy message
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
