import { getSetting, setSetting } from './services/settingsService'
import { getSecret, setSecret, deleteSecret } from './services/secureStore'
import { oauthConnected, oauthToken, oauthState } from './oauth'
import { getCompanyView } from './data/companyRepo'
import type { CompanyView, PersonView } from '@shared/types'

export interface CrmField {
  key: string
  label: string
  secret?: boolean
}

export interface CrmMeta {
  id: string
  name: string
  description: string
  fields: CrmField[]
}

export interface CrmFieldStatus extends CrmField {
  hasValue: boolean
}

export interface CrmStatus {
  id: string
  name: string
  description: string
  enabled: boolean
  configured: boolean
  fields: CrmFieldStatus[]
}

export interface CrmPushResult {
  id: string
  name: string
  ok: boolean
  message: string
}

const CRM_META: CrmMeta[] = [
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Push companies & contacts to HubSpot CRM using a private-app access token.',
    fields: [{ key: 'token', label: 'Access token (private app)', secret: true }]
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    description: 'Push accounts & contacts to Salesforce via the REST API (OAuth access token + instance URL).',
    fields: [
      { key: 'url', label: 'Instance URL', secret: false },
      { key: 'token', label: 'Access token', secret: true }
    ]
  },
  {
    id: 'odoo',
    name: 'Odoo',
    description: 'Create partner/contact records in Odoo via its JSON-RPC web API.',
    fields: [
      { key: 'url', label: 'Instance URL', secret: false },
      { key: 'db', label: 'Database name', secret: false },
      { key: 'login', label: 'Login (email)', secret: false },
      { key: 'password', label: 'Password', secret: true }
    ]
  }
]

interface CrmCreds {
  values: Record<string, string>
  secrets: Record<string, string>
}

function settingsKey(id: string, key: string): string {
  return `crm.${id}.${key}`
}

function secretKeyName(id: string, key: string): string {
  return `crm.${id}.${key}`
}

export function crmMetaList(): CrmMeta[] {
  return CRM_META
}

export function crmMeta(id: string): CrmMeta | undefined {
  return CRM_META.find((m) => m.id === id)
}

export function crmEnabled(id: string): boolean {
  return getSetting(`crm.${id}.enabled`) === 'true'
}

export function setCrmEnabled(id: string, enabled: boolean): void {
  setSetting(`crm.${id}.enabled`, enabled ? 'true' : 'false')
}

function credsFor(id: string): CrmCreds {
  const meta = crmMeta(id)
  const values: Record<string, string> = {}
  const secrets: Record<string, string> = {}
  if (!meta) return { values, secrets }
  for (const f of meta.fields) {
    if (f.secret) {
      const s = getSecret(secretKeyName(id, f.key))
      if (s) secrets[f.key] = s
    } else {
      values[f.key] = getSetting(settingsKey(id, f.key))
    }
  }
  // OAuth-connected CRMs take precedence over a manually pasted token, and the
  // instance URL is taken from the OAuth session.
  if (oauthConnected(id)) {
    const tok = oauthToken(id)
    if (tok) secrets.token = tok
    if (id === 'salesforce') {
      const inst = oauthState('salesforce')?.instance_url
      if (inst) values.url = inst
    }
  }
  return { values, secrets }
}

export function crmConfigured(id: string): boolean {
  // OAuth-connected CRMs count as configured even before a manual token exists.
  if (id === 'hubspot' || id === 'salesforce') {
    if (oauthConnected(id)) return crmEnabled(id)
  }
  const meta = crmMeta(id)
  if (!meta) return false
  const c = credsFor(id)
  return meta.fields.every((f) => (f.secret ? Boolean(c.secrets[f.key]) : Boolean(c.values[f.key])))
}

export function setCrmCredential(id: string, fields: Record<string, string>): void {
  const meta = crmMeta(id)
  if (!meta) return
  for (const f of meta.fields) {
    const value = fields[f.key]
    if (value === undefined || value === '') continue
    if (f.secret) setSecret(secretKeyName(id, f.key), value)
    else setSetting(settingsKey(id, f.key), value)
  }
  setCrmEnabled(id, true)
}

export function clearCrmCredential(id: string): void {
  const meta = crmMeta(id)
  if (!meta) return
  for (const f of meta.fields) if (f.secret) deleteSecret(secretKeyName(id, f.key))
  setCrmEnabled(id, false)
}

export function listCrmStatuses(): CrmStatus[] {
  return CRM_META.map((m) => {
    const c = credsFor(m.id)
    return {
      id: m.id,
      name: m.name,
      description: m.description,
      enabled: crmEnabled(m.id),
      configured: crmConfigured(m.id),
      fields: m.fields.map((f) => ({
        ...f,
        hasValue: f.secret ? Boolean(c.secrets[f.key]) : Boolean(c.values[f.key])
      }))
    }
  })
}

// ---------- Clients ----------

interface CrmClient {
  test(creds: CrmCreds): Promise<CrmPushResult>
  push(ctx: { company: CompanyView; people: PersonView[] }, creds: CrmCreds): Promise<CrmPushResult>
}

async function readError(resp: Response): Promise<string> {
  const raw = await resp.text()
  try {
    const j = JSON.parse(raw)
    if (j?.message) return String(j.message)
    if (Array.isArray(j) && j[0]?.message) return String(j[0].message)
    return raw.slice(0, 240)
  } catch {
    return raw.slice(0, 240)
  }
}

const hubspot: CrmClient = {
  async test(creds) {
    const r = await fetch('https://api.hubapi.com/crm/v3/objects/companies?limit=1', {
      headers: { Authorization: `Bearer ${creds.secrets.token}` }
    })
    return r.ok ? { id: 'hubspot', name: 'HubSpot', ok: true, message: 'Connected to HubSpot.' } : { id: 'hubspot', name: 'HubSpot', ok: false, message: await readError(r) }
  },
  async push({ company, people }, creds) {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.secrets.token}` }
    const props: Record<string, string> = { name: company.name }
    if (company.domain) props.domain = company.domain
    if (company.website) props.website = company.website
    if (company.industry) props.industry = company.industry
    if (company.employeeCount) props.numberofemployees = String(company.employeeCount)
    if (company.city) props.city = company.city
    if (company.country) props.country = company.country

    const cResp = await fetch('https://api.hubapi.com/crm/v3/objects/companies', {
      method: 'POST',
      headers,
      body: JSON.stringify({ properties: props })
    })
    if (!cResp.ok) return { id: 'hubspot', name: 'HubSpot', ok: false, message: await readError(cResp) }

    let pushed = 0
    for (const p of people) {
      if (!p.email && !p.firstName) continue
      const contactProps: Record<string, string> = {}
      if (p.firstName) contactProps.firstname = p.firstName
      if (p.lastName) contactProps.lastname = p.lastName
      if (p.title) contactProps.title = p.title
      if (p.email) contactProps.email = p.email
      if (company.domain) contactProps.company = company.domain
      const pResp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers,
        body: JSON.stringify({ properties: contactProps })
      })
      if (pResp.ok) pushed++
    }
    return { id: 'hubspot', name: 'HubSpot', ok: true, message: `Pushed company + ${pushed} contact${pushed === 1 ? '' : 's'} to HubSpot.` }
  }
}

const salesforce: CrmClient = {
  async test(creds) {
    const base = creds.values.url.replace(/\/+$/, '')
    const r = await fetch(`${base}/services/data/v58.0/sobjects/Account/describe`, {
      headers: { Authorization: `Bearer ${creds.secrets.token}` }
    })
    return r.ok ? { id: 'salesforce', name: 'Salesforce', ok: true, message: 'Connected to Salesforce.' } : { id: 'salesforce', name: 'Salesforce', ok: false, message: await readError(r) }
  },
  async push({ company, people }, creds) {
    const base = creds.values.url.replace(/\/+$/, '')
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.secrets.token}` }
    const account: Record<string, unknown> = { Name: company.name }
    if (company.website) account.Website = company.website
    if (company.industry) account.Industry = company.industry
    if (company.employeeCount) account.NumberOfEmployees = company.employeeCount
    if (company.city) account.BillingCity = company.city
    if (company.country) account.BillingCountry = company.country

    const aResp = await fetch(`${base}/services/data/v58.0/sobjects/Account/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(account)
    })
    if (!aResp.ok) return { id: 'salesforce', name: 'Salesforce', ok: false, message: await readError(aResp) }
    const aData = (await aResp.json()) as { id?: string }
    const accountId = aData.id

    let pushed = 0
    if (accountId) {
      for (const p of people) {
        if (!p.email && !p.firstName) continue
        const contact: Record<string, unknown> = { AccountId: accountId }
        if (p.firstName) contact.FirstName = p.firstName
        if (p.lastName) contact.LastName = p.lastName
        if (p.title) contact.Title = p.title
        if (p.email) contact.Email = p.email
        const pResp = await fetch(`${base}/services/data/v58.0/sobjects/Contact/`, {
          method: 'POST',
          headers,
          body: JSON.stringify(contact)
        })
        if (pResp.ok) pushed++
      }
    }
    return { id: 'salesforce', name: 'Salesforce', ok: true, message: `Pushed account + ${pushed} contact${pushed === 1 ? '' : 's'} to Salesforce.` }
  }
}

type OdooAuth = (creds: CrmCreds) => Promise<{ ok: boolean; message: string; cookie: string | null }>

const odoo: CrmClient & { authenticate: OdooAuth } = {
  async authenticate(creds) {
    const url = creds.values.url.replace(/\/+$/, '')
    const r = await fetch(`${url}/web/session/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: { db: creds.values.db, login: creds.values.login, password: creds.secrets.password }
      })
    })
    const data = (await r.json()) as { result?: { uid?: number } }
    if (!r.ok || !data.result?.uid) {
      return { ok: false as const, message: r.ok ? 'Authentication failed.' : await readError(r), cookie: null }
    }
    const cookie = r.headers.get('set-cookie')?.split(';')[0] ?? null
    return { ok: true as const, message: 'Connected to Odoo.', cookie }
  },
  async test(creds) {
    const a = await this.authenticate(creds)
    return { id: 'odoo', name: 'Odoo', ok: a.ok, message: a.message }
  },
  async push({ company, people }, creds) {
    const a = await this.authenticate(creds)
    if (!a.ok) return { id: 'odoo', name: 'Odoo', ok: false, message: a.message }
    const url = creds.values.url.replace(/\/+$/, '')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (a.cookie) headers.Cookie = a.cookie

    const call = async (model: string, method: string, args: unknown[]): Promise<{ result?: unknown; error?: { data?: { message?: string } } }> => {
      const r = await fetch(`${url}/web/dataset/call_kw`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs: { context: {} } } })
      })
      return (await r.json()) as { result?: unknown; error?: { data?: { message?: string } } }
    }

    const partner = await call('res.partner', 'create', [
      [{ name: company.name, website: company.website ?? undefined, is_company: true }]
    ])
    const partnerId = (partner.result as number | undefined) ?? (Array.isArray(partner.result) ? (partner.result[0] as number) : undefined)
    if (partner.error || partnerId === undefined) {
      return { id: 'odoo', name: 'Odoo', ok: false, message: partner.error?.data?.message ?? 'Failed to create partner.' }
    }
    let pushed = 0
    for (const p of people) {
      if (!p.email && !p.firstName) continue
      const c = await call('res.partner', 'create', [
        [{ name: [p.firstName, p.lastName].filter(Boolean).join(' '), email: p.email ?? undefined, function: p.title ?? undefined, parent_id: partnerId }]
      ])
      if (!c.error) pushed++
    }
    return { id: 'odoo', name: 'Odoo', ok: true, message: `Pushed partner + ${pushed} contact${pushed === 1 ? '' : 's'} to Odoo.` }
  }
}

const CLIENTS: Record<string, CrmClient> = { hubspot, salesforce, odoo }

export async function testCrm(id: string): Promise<CrmPushResult> {
  const client = CLIENTS[id]
  if (!client) return { id, name: id, ok: false, message: 'Unknown CRM.' }
  if (!crmConfigured(id)) return { id, name: id, ok: false, message: 'Connection not fully configured.' }
  return client.test(credsFor(id))
}

export async function pushCompanyToEnabledCrms(companyId: number): Promise<CrmPushResult[]> {
  const company = await getCompanyView(companyId)
  if (!company) throw new Error('Company not found.')
  const enabled = CRM_META.filter((m) => crmEnabled(m.id) && crmConfigured(m.id))
  if (enabled.length === 0) return []
  const people = company.people
  const results: CrmPushResult[] = []
  for (const m of enabled) {
    const client = CLIENTS[m.id]
    try {
      results.push(await client.push({ company, people }, credsFor(m.id)))
    } catch (err) {
      results.push({ id: m.id, name: m.name, ok: false, message: err instanceof Error ? err.message : String(err) })
    }
  }
  return results
}
