import { useCallback, useEffect, useState } from 'react'
import type { CompanyView } from '@shared/types'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useJobProgress } from '../hooks/useJobProgress'
import { copyText } from '../lib/clipboard'

export default function ListDetail({ id }: { id: number }): React.JSX.Element {
  const { nav, notify, refreshLists, recentLists } = useApp()
  const [companies, setCompanies] = useState<CompanyView[]>([])
  const [loading, setLoading] = useState(true)
  const { jobs, refresh: refreshJobs } = useJobProgress()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setCompanies(await api.listCompanies(id))
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Failed to load list.')
    } finally {
      setLoading(false)
    }
  }, [id, notify])

  useEffect(() => {
    void load()
  }, [load])

  const listName = recentLists.find((l) => l.id === id)?.name ?? ''

  async function removeCompany(companyId: number, companyName: string): Promise<void> {
    if (!window.confirm(`Remove "${companyName}" from this list?`)) return
    await api.removeCompanyFromList(id, companyId)
    refreshLists()
    void load()
  }

  async function analyzeAll(): Promise<void> {
    try {
      await api.analyzeList(id)
      notify('info', 'Analysis started in the background. Progress appears below; the AI score shows on each prospect when done.')
      refreshJobs()
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Could not start analysis.')
    }
  }

  async function exportCsv(): Promise<void> {
    try {
      const jobId = await api.exportList(id)
      notify('info', `Export started (job #${jobId}). A link will appear when the file is ready.`)
      refreshJobs()
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Export failed.')
    }
  }

  async function pushToCrm(): Promise<void> {
    try {
      await api.crmPushList(id)
      notify('info', 'Pushing this list to enabled CRMs in the background. Progress appears below.')
      refreshJobs()
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Push failed.')
    }
  }

  async function enrichAll(): Promise<void> {
    try {
      await api.enrichList(id, 'auto')
      notify('info', 'Enriching the whole list in the background (provider → web scrape → AI). Progress appears below.')
      refreshJobs()
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Enrich failed.')
    }
  }

  const relevantJobs = jobs.filter((j) => ['analyze_list', 'export_csv', 'crm_push', 'enrich_list'].includes(j.type))

  if (loading) {
    return (
      <div className="center">
        <span className="spinner" /> Loading…
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <button className="btn ghost small" onClick={() => nav.go({ name: 'lists' })}>
            ← Lists
          </button>
          <h2 style={{ margin: '4px 0 0' }}>{listName}</h2>
          <div className="muted">{companies.length} prospect{companies.length === 1 ? '' : 's'}</div>
        </div>
        <div className="row-actions">
          <button className="btn" disabled={companies.length === 0} onClick={() => void enrichAll()}>
            Enrich all
          </button>
          <button className="btn" disabled={companies.length === 0} onClick={() => void analyzeAll()}>
            ⚡ Analyze all
          </button>
          <button className="btn" disabled={companies.length === 0} onClick={() => void exportCsv()}>
            Export CSV
          </button>
          <button className="btn" disabled={companies.length === 0} onClick={() => void pushToCrm()}>
            Push to CRM
          </button>
          <button className="btn primary" onClick={() => nav.go({ name: 'home' })}>
            + Find more
          </button>
        </div>
      </div>

      {relevantJobs.length > 0 && (
        <div className="section">
          {relevantJobs.map((j) => (
            <div key={j.id} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  {j.type === 'analyze_list' ? '⚡ Analyzing prospects' : j.type === 'enrich_list' ? '⛏ Enriching prospects' : j.type === 'crm_push' ? '⇢ Pushing to CRM' : '⬇ Exporting to CSV'}
                  {j.status === 'failed' ? ' — failed' : ''}
                </span>
                <span className="muted">{j.status === 'running' ? `${j.progress}%` : ''}</span>
              </div>
              {j.status !== 'failed' ? (
                <progress value={j.progress} max={100} style={{ width: '100%', height: 8 }} />
              ) : (
                <div className="muted" style={{ fontSize: 12.5 }}>{j.error}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {companies.length === 0 ? (
        <div className="empty">
          This list is empty.
          <br />
          <span className="muted">Run a search and save matches, or import them later.</span>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {companies.map((c) => (
            <MemberRow key={c.id} company={c} onOpen={() => nav.openCompany(c.id)} onRemove={() => void removeCompany(c.id, c.name)} />
          ))}
        </div>
      )}
    </div>
  )
}

function MemberRow({ company, onOpen, onRemove }: { company: CompanyView; onOpen: () => void; onRemove: () => void }): React.JSX.Element {
  const { notify } = useApp()
  const score = company.analysis?.fitScore ?? null
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10, cursor: 'pointer' }} onClick={onOpen}>
      <div className="avatar">{company.name[0]?.toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 650 }}>{company.name}</div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {[company.industry, company.country, company.employeeCount ? `${company.employeeCount} emp` : null].filter(Boolean).join(' · ')}
          {company.signals.length > 0 && <span> · {company.signals.length} signal{company.signals.length === 1 ? '' : 's'}</span>}
        </div>
      </div>
      {score !== null && (
        <span className={`badge-score${score >= 65 ? ' high' : score >= 40 ? ' mid' : ''}`}>{score}</span>
      )}
      {company.people.length > 0 && company.people[0]?.email && (
        <button
          className="btn small"
          onClick={(e) => {
            e.stopPropagation()
            void copyText(company.people[0]!.email!).then((ok) => notify(ok ? 'success' : 'error', ok ? 'Email copied.' : 'Copy failed.'))
          }}
        >
          Copy contact
        </button>
      )}
      <button
        className="btn small"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        Remove
      </button>
    </div>
  )
}
