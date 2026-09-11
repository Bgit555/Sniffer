import { useCallback, useEffect, useState } from 'react'
import { api, type RecentSearch } from '../lib/api'
import { useApp } from '../lib/app-context'

const EXAMPLES = [
  'US SaaS companies with 20–200 employees that recently raised funding',
  'Fintech companies in the UK hiring marketing leaders',
  'Healthcare software companies expanding into new regions'
]

export default function Home(): React.JSX.Element {
  const { nav, notify } = useApp()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [recent, setRecent] = useState<RecentSearch[]>([])

  const loadRecent = useCallback(() => {
    api.recentSearches().then(setRecent).catch(() => setRecent([]))
  }, [])

  useEffect(loadRecent, [loadRecent])

  async function doSearch(raw?: string): Promise<void> {
    const q = (raw ?? query).trim()
    if (!q || busy) return
    setBusy(true)
    try {
      const outcome = await api.runSearch(q)
      loadRecent()
      nav.openSearchResults(q, outcome)
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Search failed.')
    } finally {
      setBusy(false)
    }
  }

  async function reopen(id: number): Promise<void> {
    setBusy(true)
    try {
      const outcome = await api.reopenSearch(id)
      const entry = recent.find((r) => r.id === id)
      nav.openSearchResults(entry?.query ?? 'Search results', outcome)
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Could not reopen that search.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="hero">
        <h1>Find your next prospects.</h1>
        <p>Describe your ideal customer in plain English — Sniffer handles the rest.</p>
      </div>

      <div className="search-box">
        <textarea
          placeholder="e.g. US SaaS companies with 20–200 employees that recently raised funding and are hiring marketing leaders"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void doSearch()
          }}
          rows={3}
        />
        <button className="go" disabled={busy || !query.trim()} onClick={() => void doSearch()}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </div>

      <div className="templates">
        {EXAMPLES.map((ex) => (
          <button key={ex} className="pill" onClick={() => setQuery(ex)}>
            {ex}
          </button>
        ))}
      </div>

      {busy && (
        <div className="center">
          <span className="spinner" /> Parsing your search and finding matches…
        </div>
      )}

      <div className="recent">
        <h3>Recent searches</h3>
        {recent.length === 0 && <p className="muted">Nothing yet — run your first search above.</p>}
        {recent.map((r) => (
          <div key={r.id} className="recent-item" onClick={() => void reopen(r.id)}>
            <span className="q">{r.query}</span>
            <span className="meta">
              {r.resultCount} match{r.resultCount === 1 ? '' : 'es'} · {new Date(r.createdAt).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
