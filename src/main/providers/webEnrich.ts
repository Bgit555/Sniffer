import { z } from 'zod'
import type { NormalizedPerson } from '@shared/types'
import { isAiConfigured, structured } from '../ai/router'

const PAGE_PATHS = ['', '/about', '/team', '/contact', '/careers']
const MAX_TEXT = 200_000
const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi
const LINKEDIN_RE = /(?:linkedin\.com\/company\/[a-z0-9-]+)/gi
const NOISE_EMAIL = /(example|sentry|wixpress|godaddy|your|name|email|domain|\.png|\.jpg|\.gif|\.svg|noreply|no-?reply)/i

export interface WebEnrichResult {
  people: NormalizedPerson[]
  note: string
}

interface ScrapedPage {
  url: string
  text: string
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Sniffer prospecting assistant)' }
    })
    if (!resp.ok) return null
    const ct = resp.headers.get('content-type') ?? ''
    if (!ct.includes('text/html')) return null
    const html = (await resp.text()).slice(0, 500_000)
    return stripHtml(html).slice(0, MAX_TEXT)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameFromEmail(email: string): { firstName: string; lastName: string } {
  const local = email.split('@')[0] ?? ''
  const parts = local.split(/[._-]+/).filter(Boolean).slice(0, 2)
  const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s)
  return { firstName: cap(parts[0] ?? ''), lastName: cap(parts[1] ?? '') }
}

/**
 * Web enrichment: scrape the company's own website (homepage, about, team,
 * contact, careers) for real emails, people and social links, and — when an AI
 * gateway is configured — parse the page text into structured contacts.
 */
export async function webEnrichCompany(company: {
  name: string
  domain: string | null
  website: string | null
}): Promise<WebEnrichResult> {
  const base = company.website ?? (company.domain ? `https://${company.domain}` : null)
  if (!base || !/^https?:\/\//i.test(base)) {
    return { people: [], note: 'No website to scrape.' }
  }

  const seen = new Set<string>()
  const fetched = await Promise.all(
    PAGE_PATHS.map(async (path): Promise<ScrapedPage | null> => {
      try {
        const url = new URL(path || '/', base).toString()
        if (seen.has(url)) return null
        seen.add(url)
        const text = await fetchText(url)
        return text ? { url, text } : null
      } catch {
        return null
      }
    })
  )
  const pages = fetched.filter((p): p is ScrapedPage => p !== null)
  if (pages.length === 0) return { people: [], note: 'Website unreachable.' }

  const allText = pages.map((p) => p.text).join('\n')

  // Direct scraped contacts (emails) and social links.
  const emails = [...new Set(allText.match(EMAIL_RE) ?? [])]
    .filter((e) => !NOISE_EMAIL.test(e))
    .slice(0, 20)
  const linkedin = [...new Set(allText.match(LINKEDIN_RE) ?? [])].slice(0, 5)
  const scraped: NormalizedPerson[] = emails.map((email) => {
    const { firstName, lastName } = nameFromEmail(email)
    return {
      provider: 'web',
      firstName: firstName || null,
      lastName: lastName || null,
      title: null,
      email,
      emailStatus: 'scraped',
      linkedinUrl: null,
      companyName: company.name
    }
  })

  // AI parse of page text for people + titles (names that aren't in email form).
  let aiPeople: NormalizedPerson[] = []
  if (isAiConfigured()) {
    try {
      const schema = z.object({
        contacts: z
          .array(z.object({ firstName: z.string().optional(), lastName: z.string().optional(), title: z.string().optional(), email: z.string().optional() }))
          .max(10)
      })
      const data = await structured<{ contacts: { firstName?: string; lastName?: string; title?: string; email?: string }[] }>({
        feature: 'enrich.web',
        purpose: 'extraction',
        system:
          'Extract REAL people and their job titles from this company webpage text. Only list people actually mentioned; never invent names, titles or emails. Return ONLY JSON: {"contacts":[{"firstName","lastName","title","email"}]}.',
        user: `${company.name}\n\n${allText.slice(0, 24_000)}`,
        schema
      })
      aiPeople = data.contacts
        .filter((c) => c.firstName || c.lastName || c.title)
        .map((c) => ({
          provider: 'ai-web' as const,
          firstName: c.firstName ?? null,
          lastName: c.lastName ?? null,
          title: c.title ?? null,
          email: c.email ?? null,
          emailStatus: 'scraped' as const,
          linkedinUrl: null,
          companyName: company.name
        }))
    } catch {
      /* AI parse failed — keep scraped emails only */
    }
  }

  // Merge: keep scraped emails; add AI people not already represented.
  const people = [...scraped]
  const haveEmail = new Set(scraped.map((p) => p.email?.toLowerCase()))
  for (const p of aiPeople) {
    if (p.email && haveEmail.has(p.email.toLowerCase())) continue
    people.push(p)
  }

  const note = `Scraped ${pages.length} page${pages.length === 1 ? '' : 's'}: ${emails.length} email${emails.length === 1 ? '' : 's'}${linkedin.length ? `, ${linkedin.length} LinkedIn link${linkedin.length === 1 ? '' : 's'}` : ''}${aiPeople.length ? `, ${aiPeople.length} AI-extracted contact${aiPeople.length === 1 ? '' : 's'}` : ''}.`
  return { people: people.slice(0, 30), note }
}
