import type { AiProviderKind } from '@shared/types'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  system?: string
}

export interface ChatResult {
  text: string
  model: string
}

/** Which model profile a feature should use. */
export type ModelPurpose = 'default' | 'research' | 'writing' | 'extraction'

export interface AIClient {
  readonly provider: AiProviderKind
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult>
}

/** A parsed + validated structured result. */
export interface StructuredOptions<T> {
  /** Short label for logs/usage, e.g. "search.parse". */
  feature: string
  system: string
  user: string
  /** Model purpose used to pick the configured model. */
  purpose: ModelPurpose
  /** Zod schema used to validate + type the output. */
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } }
  temperature?: number
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      'AI is not configured yet. Open Settings and add your gateway URL, API key and model.'
    )
    this.name = 'AiNotConfiguredError'
  }
}
