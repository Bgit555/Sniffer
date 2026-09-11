import type { AIClient, ChatMessage, ChatOptions, ChatResult } from './types'
import type { AiProviderKind } from '@shared/types'
import { GatewayError, joinUrl } from './openaiClient'

/**
 * Anthropic Messages API client. The user's base URL may already include a
 * `/v1` prefix or point directly at `/v1/messages`; we normalise all three.
 */
export class AnthropicCompatibleClient implements AIClient {
  readonly provider: AiProviderKind
  constructor(
    private readonly config: { baseUrl: string; apiKey: string },
    provider: AiProviderKind = 'anthropic'
  ) {
    this.provider = provider
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    const system = opts.system
    const body: Record<string, unknown> = {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2048,
      messages: messages.map((m) => ({ role: m.role, content: m.content }))
    }
    if (system) body.system = system
    if (opts.temperature !== undefined) body.temperature = opts.temperature

    let url = joinUrl(this.config.baseUrl, 'v1/messages')
    // Already points at the messages endpoint? Use as-is.
    if (/\/messages\/?$/.test(this.config.baseUrl.trim())) {
      url = this.config.baseUrl.trim().replace(/\/+$/, '')
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    })

    if (!resp.ok) {
      const text = await resp.text()
      let msg = text
      try {
        const parsed = JSON.parse(text)
        msg = parsed?.error?.message || text
      } catch {
        /* raw body */
      }
      throw new GatewayError(`AI gateway error (${resp.status}): ${msg}`, resp.status)
    }

    const data = (await resp.json()) as { content?: Array<{ type?: string; text?: string }>; model?: string }
    const text = (data?.content ?? [])
      .filter((b) => b?.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
    if (!text) throw new GatewayError('AI gateway returned an unexpected response shape.')
    return { text, model: data?.model ?? opts.model ?? '' }
  }
}
