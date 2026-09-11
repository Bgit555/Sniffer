import type { NormalizedPerson } from '@shared/types'

const API = 'https://api.linkedin.com/v2'

/**
 * LinkedIn enrichment. The people-search surface is restricted by LinkedIn to
 * approved partner / Sales Navigator apps — a normal "Login with LinkedIn" token
 * can authenticate (/v2/me) but LinkedIn itself returns 403 for member search.
 * We still call it so that once your app is approved the same code path works,
 * and we surface LinkedIn's own error message otherwise.
 */
export async function linkedInEnrichPeople(domain: string, token: string): Promise<NormalizedPerson[]> {
  const meResp = await fetch(`${API}/me`, {
    headers: { Authorization: `Bearer ${token}`, 'LinkedIn-Version': '202309', 'Content-Type': 'application/json' }
  })
  if (!meResp.ok) {
    throw new Error(`LinkedIn token invalid (HTTP ${meResp.status}). Reconnect under Connected apps.`)
  }

  const searchResp = await fetch(`${API}/peopleSearch?q=people&count=10`, {
    headers: { Authorization: `Bearer ${token}`, 'LinkedIn-Version': '202309', 'Content-Type': 'application/json' }
  })
  if (!searchResp.ok) {
    const raw = await searchResp.text()
    throw new Error(`LinkedIn member search blocked (HTTP ${searchResp.status}): ${raw.slice(0, 200)}. LinkedIn requires an approved partner/Sales Navigator app.`)
  }

  const data = (await searchResp.json()) as { elements?: Record<string, unknown>[] }
  const elements = data.elements ?? []
  return elements
    .map((e) => {
      const firstName = pick(e, ['firstName', 'firstName.localized.en_US'])
      const lastName = pick(e, ['lastName', 'lastName.localized.en_US'])
      return {
        provider: 'linkedin',
        providerRecordId: pick(e, ['id']),
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        title: pick(e, ['headline']),
        companyName: domain,
        email: null,
        emailStatus: null,
        linkedinUrl: pick(e, ['linkedinUrl']) ? `https://www.linkedin.com/in/${pick(e, ['vanityName'])}` : null,
        location: pick(e, ['locationName'])
      } as NormalizedPerson
    })
    .filter((p) => p.firstName || p.lastName || p.title)
}

function pick(item: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    if (typeof item[k] === 'string' && (item[k] as string).trim()) return item[k] as string
  }
  return null
}
