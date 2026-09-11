import { getSyncDb } from '../db'
import { getSecret, setSecret, deleteSecret } from './secureStore'
import type { AiSettingsInput, AiSettingsView, AiProviderKind } from '@shared/types'

const AI_API_KEY_SECRET = 'ai.apiKey'

// Settings are read/written through the synchronous node:sqlite handle so the
// AI router and feature code can stay synchronous. Keys are never exposed here.

export function getSetting(key: string, fallback = ''): string {
  const db = getSyncDb()
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string | null }
    | undefined
  return row?.value ?? fallback
}

export function setSetting(key: string, value: string): void {
  const db = getSyncDb()
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, Date.now())
}

const DEFAULTS = {
  provider: 'openai' as AiProviderKind,
  baseUrl: '',
  modelDefault: '',
  modelResearch: '',
  modelWriting: '',
  modelExtraction: '',
  temperature: 0.4,
  maxTokens: 2048
}

export function getAiSettings(): AiSettingsView {
  return {
    provider: (getSetting('ai.provider') as AiProviderKind) || DEFAULTS.provider,
    baseUrl: getSetting('ai.baseUrl', DEFAULTS.baseUrl),
    modelDefault: getSetting('ai.model.default', DEFAULTS.modelDefault),
    modelResearch: getSetting('ai.model.research', DEFAULTS.modelResearch),
    modelWriting: getSetting('ai.model.writing', DEFAULTS.modelWriting),
    modelExtraction: getSetting('ai.model.extraction', DEFAULTS.modelExtraction),
    temperature: Number(getSetting('ai.temperature', String(DEFAULTS.temperature))),
    maxTokens: Number(getSetting('ai.maxTokens', String(DEFAULTS.maxTokens))),
    hasApiKey: getSecret(AI_API_KEY_SECRET) !== null,
    preset: getSetting('ai.preset')
  }
}

export function updateAiSettings(input: AiSettingsInput): AiSettingsView {
  if (input.provider) setSetting('ai.provider', input.provider)
  if (input.baseUrl !== undefined) setSetting('ai.baseUrl', input.baseUrl.trim())
  if (input.modelDefault !== undefined) setSetting('ai.model.default', input.modelDefault.trim())
  if (input.modelResearch !== undefined) setSetting('ai.model.research', input.modelResearch.trim())
  if (input.modelWriting !== undefined) setSetting('ai.model.writing', input.modelWriting.trim())
  if (input.modelExtraction !== undefined) setSetting('ai.model.extraction', input.modelExtraction.trim())
  if (input.temperature !== undefined) setSetting('ai.temperature', String(input.temperature))
  if (input.maxTokens !== undefined) setSetting('ai.maxTokens', String(input.maxTokens))
  if (input.preset !== undefined) setSetting('ai.preset', input.preset)

  if (input.apiKey !== undefined && input.apiKey.trim() !== '') {
    const saved = setSecret(AI_API_KEY_SECRET, input.apiKey.trim())
    if (!saved) {
      throw new Error(
        'Secure storage is unavailable on this system, so the API key was NOT saved. Only the rest of the settings were stored.'
      )
    }
  }

  return getAiSettings()
}

export function clearAiApiKey(): void {
  deleteSecret(AI_API_KEY_SECRET)
}
