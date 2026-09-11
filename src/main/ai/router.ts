import { getAiSettings } from '../services/settingsService'
import { getSecret } from '../services/secureStore'
import { OpenAICompatibleClient } from './openaiClient'
import { AnthropicCompatibleClient } from './anthropicClient'
import {
  AiNotConfiguredError,
  type AIClient,
  type ChatMessage,
  type ModelPurpose,
  type StructuredOptions
} from './types'

const API_KEY_SECRET = 'ai.apiKey'

export function isAiConfigured(): boolean {
  const s = getAiSettings()
  const hasModel = !!(s.modelDefault || s.modelResearch || s.modelWriting || s.modelExtraction)
  return Boolean(s.baseUrl && s.hasApiKey && hasModel)
}

interface ModelConfig {
  model: string
  temperature: number
  maxTokens: number
}

function resolveModel(purpose: ModelPurpose): ModelConfig {
  const s = getAiSettings()
  let model = ''
  switch (purpose) {
    case 'research':
      model = s.modelResearch
      break
    case 'writing':
      model = s.modelWriting
      break
    case 'extraction':
      model = s.modelExtraction
      break
    default:
      model = s.modelDefault
  }
  model = model || s.modelDefault
  return { model, temperature: s.temperature, maxTokens: s.maxTokens }
}

/** Resolve the configured model name for a purpose (for display/usage logs). */
export function modelForPurpose(purpose: ModelPurpose): string {
  return resolveModel(purpose).model
}

export function makeClient(): AIClient {
  const s = getAiSettings()
  const apiKey = getSecret(API_KEY_SECRET)
  if (!s.baseUrl || !apiKey) throw new AiNotConfiguredError()
  if (s.provider === 'anthropic') {
    return new AnthropicCompatibleClient({ baseUrl: s.baseUrl, apiKey }, s.provider)
  }
  return new OpenAICompatibleClient({ provider: s.provider, baseUrl: s.baseUrl, apiKey })
}

export interface PlainChatInput {
  prompt: string
  system?: string
  purpose?: ModelPurpose
  temperature?: number
}

export async function chatText(input: PlainChatInput): Promise<string> {
  const client = makeClient()
  const cfg = resolveModel(input.purpose ?? 'default')
  const messages: ChatMessage[] = [{ role: 'user', content: input.prompt }]
  const res = await client.chat(messages, {
    model: cfg.model,
    system: input.system,
    temperature: input.temperature ?? cfg.temperature,
    maxTokens: cfg.maxTokens
  })
  return res.text
}

/** Extract a JSON value from an LLM reply that may be fenced or prefixed. */
export function parseJson(text: string): unknown | undefined {
  const cleaned = text
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    /* fall through to substring extraction */
  }
  const start = cleaned.search(/[[{]/)
  if (start === -1) return undefined
  for (let end = cleaned.length; end > start; end--) {
    const slice = cleaned.slice(start, end)
    try {
      return JSON.parse(slice)
    } catch {
      /* keep shrinking */
    }
  }
  return undefined
}

function errorString(e: unknown): string {
  if (e && typeof e === 'object' && 'issues' in e) {
    return JSON.stringify((e as { issues: unknown }).issues)
  }
  return String(e)
}

export async function structured<T>(opts: StructuredOptions<T>): Promise<T> {
  const client = makeClient()
  const cfg = resolveModel(opts.purpose)
  const temperature = opts.temperature ?? cfg.temperature
  let lastError = ''

  for (let attempt = 0; attempt < 3; attempt++) {
    let prompt = opts.user
    if (attempt > 0) {
      prompt = `${opts.user}\n\nYour previous response failed validation. Fix ONLY the errors below and return valid JSON.\n${lastError}`
    }
    const res = await client.chat(
      [{ role: 'user', content: prompt }],
      { model: cfg.model, system: opts.system, temperature, maxTokens: cfg.maxTokens }
    )
    const parsed = parseJson(res.text)
    if (parsed === undefined) {
      lastError = 'Response was not valid JSON.'
      continue
    }
    const result = opts.schema.safeParse(parsed)
    if (result.success) return result.data as T
    lastError = errorString(result.error)
  }

  throw new Error(`AI (${opts.feature}) failed to produce valid structured output after retries.`)
}
