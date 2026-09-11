import { writeFileSync } from 'fs'
import { join } from 'path'
import type { CompanyView } from '@shared/types'
import { getCompanyViews } from '../data/companyRepo'
import { appDirs } from './appPaths'

function esc(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

const HEADERS = [
  'Company',
  'Website',
  'Domain',
  'Industry',
  'Country',
  'City',
  'Employees',
  'Description',
  'Signals',
  'Fit score',
  'AI angle',
  'Decision makers'
]

function signalText(c: CompanyView): string {
  return c.signals.map((s) => (s.title ? `${s.type}: ${s.title}` : s.type)).join('; ')
}

function decisionMakers(c: CompanyView): string {
  return c.people
    .map((p) => [p.firstName, p.lastName].filter(Boolean).join(' ') + (p.title ? ` (${p.title})` : '') + (p.email ? ` — ${p.email}` : ''))
    .join('; ')
}

export async function exportCompaniesToCsv(companyIds: number[]): Promise<{ filePath: string; count: number }> {
  const companies = await getCompanyViews(companyIds)
  const lines = [HEADERS.map(esc).join(',')]
  for (const c of companies) {
    lines.push(
      [
        c.name,
        c.website,
        c.domain,
        c.industry,
        c.country,
        c.city,
        c.employeeCount,
        c.description,
        signalText(c),
        c.analysis?.fitScore,
        c.analysis?.recommendedAngle,
        decisionMakers(c)
      ]
        .map(esc)
        .join(',')
    )
  }

  const filePath = join(appDirs().exports, `sniffer-export-${Date.now()}.csv`)
  writeFileSync(filePath, '﻿' + lines.join('\r\n'), 'utf-8') // BOM so Excel reads UTF-8
  return { filePath, count: companies.length }
}

export function openExportFolder(): string {
  return appDirs().exports
}
