import type { CompanyView } from '@shared/types'

function scoreClass(score: number | null): string {
  if (score === null || score === undefined) return ''
  return score >= 65 ? ' high' : score >= 40 ? ' mid' : ''
}

function initials(name: string): string {
  return name
    .split(/[^A-Za-z]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '•'
}

export default function CompanyCard({ company, onClick }: { company: CompanyView; onClick?: () => void }): React.JSX.Element {
  const score = company.analysis?.fitScore ?? null
  return (
    <div className="card" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick?.()}>
      <div className="company-name">
        <span className="avatar">{initials(company.name)}</span>
        <span style={{ flex: 1 }}>{company.name}</span>
        {score !== null && <span className={`badge-score${scoreClass(score)}`}>{score}</span>}
      </div>
      {company.domain && <div className="domain">{company.domain}</div>}
      {company.description && <div className="desc">{company.description}</div>}
      <div className="chips">
        {company.industry && <span className="chip accent">{company.industry}</span>}
        {company.country && <span className="chip">{company.country}</span>}
        {company.employeeCount !== null && company.employeeCount !== undefined && (
          <span className="chip">{company.employeeCount.toLocaleString()} employees</span>
        )}
        {company.signals.length > 0 && <span className="chip signal">{company.signals.length} signal{company.signals.length === 1 ? '' : 's'}</span>}
        {company.people.length > 0 && <span className="chip">{company.people.length} contact{company.people.length === 1 ? '' : 's'}</span>}
      </div>
    </div>
  )
}
