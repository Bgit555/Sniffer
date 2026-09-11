import { createHash, randomBytes } from 'crypto'
import { createServer } from 'http'
import { shell } from 'electron'
import { getSetting, setSetting } from './services/settingsService'
import { getSecret, setSecret, deleteSecret } from './services/secureStore'

export interface OAuthProvider {
  id: string
  name: string
  kind: 'crm' | 'data'
  description: string
  authorizeUrl: string
  tokenUrl: string
  scopes: string
  extra?: Record<string, string>
  note?: string
}

const PROVIDERS: OAuthProvider[] = [
  {
    id: 'salesforce',
    name: 'Salesforce',
    kind: 'crm',
    description: 'Login with Salesforce to push accounts & contacts.',
    authorizeUrl: 'https://login.salesforce.com/services/oauth2/authorize',
    tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
    scopes: 'api refresh_token id'
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    kind: 'crm',
    description: 'Login with HubSpot to push companies & contacts.',
    authorizeUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    scopes: 'crm.objects.companies.write crm.objects.contacts.write'
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    kind: 'data',
    description: 'Login with LinkedIn for enrichment/research (requires a LinkedIn developer app).',
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: 'r_liteprofile r_emailaddress',
    note: 'LinkedIn restricts data access to approved partner apps.'
  }
]

export interface OAuthStatus {
  id: string
  name: string
  kind: string
  description: string
  note?: string
  connected: boolean
  connectedAt: number | null
  hasApp: boolean
}

function clientIdKey(id: string): string {
  return `oauth.${id}.clientId`
}

function appSecretKey(id: string): string {
  return `oauth.${id}.clientSecret`
}

function tokenSecretKey(id: string): string {
  return `oauth.${id}.token`
}

function oauthList(): OAuthProvider[] {
  return PROVIDERS
}

function providerMeta(id: string): OAuthProvider | undefined {
  return PROVIDERS.find((p) => p.id === id)
}

export function oauthHasApp(id: string): boolean {
  return Boolean(getSetting(clientIdKey(id)) && getSecret(appSecretKey(id)))
}

export function oauthConnected(id: string): boolean {
  return getSecret(tokenSecretKey(id)) !== null
}

export function oauthToken(id: string): string | null {
  return getSecret(tokenSecretKey(id))
}

export function oauthState(id: string): Record<string, string> | null {
  const raw = getSecret(`oauth.${id}.state`)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function setOAuthApp(id: string, clientId: string, clientSecret: string): OAuthStatus {
  setSetting(clientIdKey(id), clientId.trim())
  if (clientSecret.trim()) setSecret(appSecretKey(id), clientSecret.trim())
  return oauthStatus(id)
}

export function oauthStatus(id: string): OAuthStatus {
  const meta = providerMeta(id)!
  return {
    id,
    name: meta.name,
    kind: meta.kind,
    description: meta.description,
    note: meta.note,
    connected: oauthConnected(id),
    connectedAt: Number(getSetting(`oauth.${id}.connectedAt`) || 0) || null,
    hasApp: oauthHasApp(id)
  }
}

export function oauthStatuses(): OAuthStatus[] {
  return PROVIDERS.map((p) => oauthStatus(p.id))
}

export function oauthListCatalog(): OAuthProvider[] {
  return oauthList()
}

export function disconnectOAuth(id: string): OAuthStatus {
  deleteSecret(tokenSecretKey(id))
  deleteSecret(`oauth.${id}.refresh`)
  deleteSecret(`oauth.${id}.state`)
  setSetting(`oauth.${id}.connectedAt`, '')
  return oauthStatus(id)
}

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export interface OAuthResult {
  ok: boolean
  message: string
  who?: string
}

/**
 * Run the "Login with X" browser flow: PKCE authorization code + localhost
 * callback. Requires the user's own OAuth app credentials (client id/secret)
 * from each provider's developer console.
 */
export async function connectOAuth(id: string, timeoutMs = 120_000): Promise<OAuthResult> {
  const meta = providerMeta(id)
  if (!meta) return { ok: false, message: 'Unknown OAuth app.' }
  if (!oauthHasApp(id)) {
    return { ok: false, message: 'Add a Client ID + Client Secret for this app in Settings first (from the provider developer console).' }
  }
  if (oauthConnected(id)) return { ok: true, message: 'Already connected.' }

  const clientId = getSetting(clientIdKey(id))
  const clientSecret = getSecret(appSecretKey(id))

  return new Promise<OAuthResult>((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname === `/oauth/callback/${id}`) {
        const code = url.searchParams.get('code')
        const err = url.searchParams.get('error')
        res.writeHead(200, { 'Content-Type': 'text/html' })
        if (err) {
          res.end(`<h2>Sniffer</h2><p>Connection failed: ${escapeHtml(err)}. You can close this tab.</p>`)
          finish({ ok: false, message: `Provider returned: ${err}` })
        } else if (code) {
          res.end('<h2>Sniffer</h2><p>Connected! You can close this tab.</p>')
          void exchange(code)
        } else {
          res.end('<h2>Sniffer</h2><p>Missing auth code. Close this tab.</p>')
          finish({ ok: false, message: 'Provider did not return an authorization code.' })
        }
      } else {
        res.writeHead(404).end('not found')
      }
    })

    const finish = (result: OAuthResult): void => {
      clearTimeout(timer)
      server.close()
      resolve(result)
    }

    const exchange = async (code: string): Promise<void> => {
      try {
        const body = new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret ?? '',
          code,
          redirect_uri: redirectUri,
          code_verifier: verifier
        })
        const resp = await fetch(meta.tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        })
        const data = (await resp.json().catch(() => ({}))) as {
          access_token?: string
          refresh_token?: string
          instance_url?: string
          error_description?: string
          error?: string
        }
        if (!resp.ok || !data.access_token) {
          finish({ ok: false, message: `Token exchange failed: ${data.error_description ?? data.error ?? resp.status}` })
          return
        }
        setSecret(tokenSecretKey(id), data.access_token)
        if (data.refresh_token) setSecret(`oauth.${id}.refresh`, data.refresh_token)
        setSecret(`oauth.${id}.state`, JSON.stringify({ instance_url: data.instance_url ?? '' }))
        setSetting(`oauth.${id}.connectedAt`, String(Date.now()))
        const who = data.instance_url ? data.instance_url.replace(/^https?:\/\//, '') : meta.name
        finish({ ok: true, message: `Connected to ${meta.name} (${who}).`, who })
      } catch (err) {
        finish({ ok: false, message: `Token exchange failed: ${err instanceof Error ? err.message : String(err)}` })
      }
    }

    const verifier = base64Url(randomBytes(32))
    const challenge = base64Url(createHash('sha256').update(verifier).digest())
    const port = 47000 + Math.floor(Math.random() * 3000)
    const redirectUri = `http://127.0.0.1:${port}/oauth/callback/${id}`

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: meta.scopes,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...(meta.extra ?? {})
    })

    server.listen(port, '127.0.0.1', () => {
      void shell.openExternal(`${meta.authorizeUrl}?${params.toString()}`)
    })

    const timer = setTimeout(() => {
      finish({ ok: false, message: 'Timed out waiting for the provider to redirect back. Try again.' })
    }, timeoutMs)
  })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
