import { useCallback, useEffect, useState } from 'react'
import type { SavedSearchView } from '../lib/api'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'

export default function SavedSearches(): React.JSX.Element {
  const { nav, notify } = useApp()
  const [searches, setSearches] = useState<SavedSearchView[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setSearches(await api.savedSearches())
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Failed to load saved searches.')
    }
  }, [notify])

  useEffect(() => {
    void load()
  }, [load])

  async function runNow(s: SavedSearchView): Promise<void> {
    setBusyId(s.id)
    try {
      const out = await api.runSavedSearch(s.id)
      notify(
        'success',
        `"${s.name}" → ${out.view.lastResultCount} matches (${out.view.lastNewMatches} new · ${out.view.lastNewSignals} new signals).`
      )
      if (out.view.lastNewMatches > 0) {
        nav.openSearchResults(s.query, { spec: null, companies: out.companies, meta: null })
      } else {
        void load()
      }
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Re-run failed.')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(s: SavedSearchView): Promise<void> {
    if (!window.confirm(`Delete saved search "${s.name}"?`)) return
    await api.deleteSavedSearch(s.id)
    notify('success', 'Deleted.')
    void load()
  }

  async function toggle(s: SavedSearchView): Promise<void> {
    await api.setSavedSearchEnabled(s.id, !s.enabled)
    void load()
  }

  return (
    <div>
      <h2>Saved searches & signals</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        Save an ICP search and re-run it later — Sniffer reports how many matches and signals are new since the last run.
      </p>

      {searches.length === 0 ? (
        <div className="empty">
          No saved searches yet.
          <br />
          <span className="muted">Run a search and click “Save search” on the results page.</span>
        </div>
      ) : (
        searches.map((s) => (
          <div className="card" key={s.id} style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 650 }}>
                  {s.name}
                  <span className={`chip signal`} style={{ marginLeft: 8 }}>
                    {s.enabled ? 'on' : 'off'}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>“{s.query}”</div>
              </div>
              <span className="muted" style={{ fontSize: 12 }}>
                {s.lastRunAt ? `last run ${new Date(s.lastRunAt).toLocaleString()}` : 'never run'}
              </span>
            </div>

            {s.lastRunAt && (
              <div className="chips" style={{ marginTop: 10 }}>
                <span className="chip accent">{s.lastResultCount} matches</span>
                <span className={s.lastNewMatches > 0 ? 'chip signal' : 'chip'}>{s.lastNewMatches} new matches</span>
                <span className="chip">{s.lastNewSignals} new signals</span>
              </div>
            )}

            <div className="row-actions" style={{ marginTop: 12 }}>
              <button className="btn primary small" disabled={busyId === s.id} onClick={() => void runNow(s)}>
                {busyId === s.id ? 'Running…' : s.lastRunAt ? 'Run now' : 'Run'}
              </button>
              <button className="btn small" onClick={() => void toggle(s)}>
                {s.enabled ? 'Pause' : 'Enable'}
              </button>
              <button className="btn small" onClick={() => void remove(s)}>Delete</button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
