import { useMemo } from 'react'
import type { SearchOutcome } from '../lib/api'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import CompanyCard from '../components/CompanyCard'
import SaveToList from '../components/SaveToList'

interface Props {
  query: string
  outcome: SearchOutcome
}

export default function Results({ query, outcome }: Props): React.JSX.Element {
  const { nav, notify } = useApp()
  const companies = outcome.companies
  const spec = outcome.spec

  const filterChips = useMemo(() => {
    if (!spec) return []
    const chips: string[] = []
    if (spec.industries.length) chips.push(...spec.industries)
    if (spec.locations.length) chips.push(...spec.locations.map((l) => `📍 ${l}`))
    if (spec.employeeMin !== undefined || spec.employeeMax !== undefined) {
      chips.push(`👥 ${spec.employeeMin ?? 0}–${spec.employeeMax ?? '∞'} emp`)
    }
    if (spec.signals.length) chips.push(...spec.signals.map((s) => `⚡ ${s.replace(/_/g, ' ')}`))
    return chips
  }, [spec])

  const ids = companies.map((c) => c.id)

  async function exportCsv(): Promise<void> {
    try {
      const jobId = await api.exportSelection(ids)
      notify('info', `Export started (job #${jobId}). You’ll get a link when it’s ready.`)
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Export failed.')
    }
  }

  async function saveSearch(): Promise<void> {
    const name = window.prompt('Name this saved search', query.slice(0, 48))
    if (!name) return
    try {
      await api.createSavedSearch(name, query)
      notify('success', 'Search saved — find it under “Saved”.')
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Could not save search.')
    }
  }

  const meta = outcome.meta

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <button className="btn ghost small" onClick={() => nav.go({ name: 'home' })}>
            ← New search
          </button>
          <h2 style={{ margin: '6px 0 4px' }}>{companies.length} match{companies.length === 1 ? '' : 'es'}</h2>
          <div className="muted" style={{ fontSize: 13 }}>“{query}”</div>
        </div>
        <div className="row-actions">
          <button className="btn" onClick={() => void saveSearch()}>Save search</button>
          <SaveToList companyIds={ids} />
          <button className="btn" onClick={() => void exportCsv()}>Export CSV</button>
        </div>
      </div>

      {meta && (
        <div style={{ margin: '10px 0 0' }}>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Source:{' '}
          </span>
          {meta.providers.map((s) => (
            <span key={s.id} className={`chip ${s.demo ? '' : 'accent'}`} style={{ marginRight: 4 }}>
              {s.demo ? 'Demo dataset (fictional)' : s.name}
            </span>
          ))}
          {meta.notes.length > 0 && (
            <div
              className="section"
              style={{
                marginTop: 8,
                padding: '8px 12px',
                borderColor: meta.usedDemo ? 'var(--warn)' : 'var(--border)'
              }}
            >
              <span className="muted" style={{ fontSize: 12.5 }}>
                {meta.usedDemo ? '⚠ Showing demo fallback — ' : 'ℹ '}
              </span>
              {meta.notes.map((n, i) => (
                <div key={i} className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{n}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {filterChips.length > 0 && (
        <div className="chips" style={{ margin: '12px 0' }}>
          {filterChips.map((c) => (
            <span key={c} className="chip accent">{c}</span>
          ))}
        </div>
      )}

      {companies.length === 0 ? (
        <div className="empty">
          No matches{meta?.usedDemo ? ' in the demo dataset' : ''}.
          <br />
          <span className="muted">
            {meta?.notes?.length
              ? 'Review the note above — your live provider returned nothing or failed.'
              : meta?.providers?.some((s) => !s.demo)
                ? 'Enable “demo fallback” in Settings to also see demo data.'
                : 'Try different filters or search terms.'}
          </span>
        </div>
      ) : (
        <div className="grid" style={{ marginTop: 16 }}>
          {companies.map((c) => (
            <CompanyCard key={c.id} company={c} onClick={() => nav.openCompany(c.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
