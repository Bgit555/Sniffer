import type { ProviderSettingView } from '@shared/types'
import { getSecret, setSecret, deleteSecret } from '../services/secureStore'
import { getSetting, setSetting } from '../services/settingsService'
import { oauthConnected, oauthToken } from '../oauth'
import { apifySearchActors } from './apify'

export interface ProviderMeta {
  id: string
  name: string
  capabilities: ('search' | 'enrichment')[]
  description: string
  builtIn?: boolean
}

const META: ProviderMeta[] = [
  {
    id: 'demo',
    name: 'Demo dataset',
    capabilities: ['search'],
    description: 'Built-in fictional dataset so Sniffer works with zero setup.',
    builtIn: true
  },
  {
    id: 'apollo',
    name: 'Apollo',
    capabilities: ['search', 'enrichment'],
    description: 'Company & people data — search and enrichment from one API key.'
  },
  {
    id: 'apify',
    name: 'Apify',
    capabilities: ['search', 'enrichment'],
    description: 'Cloud scrapers. One token; Sniffer auto-discovers and runs the right actor for each task.'
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    capabilities: ['enrichment'],
    description: 'Connect with LinkedIn (OAuth). Member search needs LinkedIn partner approval.'
  }
]

function enabledKey(id: string): string {
  return `provider.${id}.enabled`
}

function keySecret(id: string): string {
  return `provider.${id}.key`
}

export function providerList(): ProviderMeta[] {
  return META
}

export function providerMeta(id: string): ProviderMeta | undefined {
  return META.find((m) => m.id === id)
}

export function providerEnabled(id: string): boolean {
  if (id === 'demo') return true
  return getSetting(enabledKey(id)) === 'true'
}

export function providerHasKey(id: string): boolean {
  if (id === 'linkedin') return oauthConnected('linkedin')
  return getSecret(keySecret(id)) !== null
}

export function providerApiKey(id: string): string | null {
  if (id === 'linkedin') return oauthToken('linkedin')
  return getSecret(keySecret(id))
}

export function providerConfigured(id: string): boolean {
  return providerEnabled(id) && providerHasKey(id)
}

export function setProviderKey(id: string, apiKey: string): boolean {
  const ok = setSecret(keySecret(id), apiKey.trim())
  if (ok) setSetting(enabledKey(id), 'true')
  return ok
}

export function clearProviderKey(id: string): void {
  deleteSecret(keySecret(id))
}

export function setProviderEnabled(id: string, enabled: boolean): void {
  setSetting(enabledKey(id), enabled ? 'true' : 'false')
}

export function getProviderSettings(): ProviderSettingView[] {
  return META.map((m) => ({
    id: m.id,
    name: m.name,
    capabilities: m.capabilities,
    enabled: providerEnabled(m.id),
    hasApiKey: m.builtIn ? true : providerHasKey(m.id),
    description: m.description
  }))
}

export function enabledSearchProviders(): ProviderMeta[] {
  return META.filter((m) => m.capabilities.includes('search') && m.id !== 'demo' && providerConfigured(m.id))
}

export function enabledEnrichmentProviders(): ProviderMeta[] {
  return META.filter((m) => m.capabilities.includes('enrichment') && providerConfigured(m.id))
}

// ---- Apify actor auto-discovery ----

function actorKey(purpose: 'search' | 'enrichment'): string {
  return `provider.apify.actor.${purpose}`
}

function cachedActor(purpose: 'search' | 'enrichment'): string {
  return getSetting(actorKey(purpose))
}

/**
 * Sniffer picks the Apify actor itself: if none is cached for this purpose, it
 * searches the Apify store with task-relevant terms and caches the best match.
 */
export async function ensureApifyActor(token: string, terms: string, purpose: 'search' | 'enrichment'): Promise<string | null> {
  const cached = cachedActor(purpose)
  if (cached) return cached
  const candidates = await apifySearchActors(token, terms)
  const picked = candidates[0]
  if (!picked) return null
  setSetting(actorKey(purpose), picked.actorId)
  return picked.actorId
}

export function cacheApifyActor(purpose: 'search' | 'enrichment', actorId: string): void {
  setSetting(actorKey(purpose), actorId)
}

/**
 * Whether to fall back to the demo dataset when live providers return nothing.
 */
export function demoFallbackEnabled(): boolean {
  return getSetting('search.demoFallback') === 'true'
}

export function setDemoFallbackEnabled(enabled: boolean): void {
  setSetting('search.demoFallback', enabled ? 'true' : 'false')
}
