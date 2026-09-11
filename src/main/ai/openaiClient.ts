import type { AIClient, ChatMessage, ChatOptions, ChatResult } from './types'
import type { AiProviderKind } from '@shared/types'

/** Join a base URL with a path segment without doubling slashes. */
export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export interface CompatibleConfig {
  provider: AiProviderKind
  baseUrl: string
  apiKey: string
}

/** Error carrying a human-readable message from the gateway response. */
export class GatewayError extends Error {
  status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'GatewayError'
    this.status = status
  }
}

async function readError(resp: Response): Promise<string> {
  const raw = await resp.text()
  try {
    const parsed = JSON.parse(raw)
    const msg =
      parsed?.error?.message ||
      parsed?.message ||
      parsed?.detail ||
      (typeof parsed === 'string' ? parsed : '')
    return msg ? String(msg) : raw
  } catch {
    return raw
  }
}

export class OpenAICompatibleClient implements AIClient {
  readonly provider: AiProviderKind
  constructor(private readonly config: CompatibleConfig) {
    this.provider = config.provider === 'anthropic' ? 'anthropic' : 'openai'
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    const fullMessages: ChatMessage[] = opts.system
      ? [{ role: 'system', content: opts.system }, ...messages]
      : messages

    const body: Record<string, unknown> = {
      model: opts.model,
      messages: fullMessages
    }
    if (opts.temperature !== undefined) body.temperature = opts.temperature
    if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens

    const url = joinUrl(this.config.baseUrl, 'chat/completions')
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(body)
    })

    if (!resp.ok) {
      throw new GatewayError(
        `AI gateway error (${resp.status}): ${await readError(resp)}`,
        resp.status
      )
    }

    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }>; model?: string }
    const text: string | undefined = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string') {
      throw new GatewayError('AI gateway returned an unexpected response shape.')
    }
    const model: string = data?.model ?? opts.model ?? ''
    return { text, model }
  }
}
