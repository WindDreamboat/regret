import type { ChatProvider } from '../../core/llm/ChatProvider'
import type { ChatMessage, StreamEvent } from '../../core/llm/protocol'

/** 最小 fetch 依赖，便于测试注入 */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface DeepSeekAdapterOptions {
  /** 代理端点，默认 /api/chat。密钥由代理持有，不经过前端。 */
  endpoint?: string
  fetchImpl?: FetchLike
}

const DEFAULT_ENDPOINT = '/api/chat'

/**
 * 对话提供方适配器。
 *
 * 请求发往自建代理而非 DeepSeek 官方接口，密钥只在代理侧。代理原样透传
 * DeepSeek 的 SSE，因此这里解析的是 OpenAI 兼容格式。
 */
export class DeepSeekAdapter implements ChatProvider {
  private readonly endpoint: string
  private readonly fetchImpl: FetchLike

  constructor(options: DeepSeekAdapterOptions = {}) {
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init))
  }

  async *stream(messages: ChatMessage[]): AsyncIterable<StreamEvent> {
    let response: Response
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })
    } catch (error) {
      yield { type: 'error', message: `请求失败：${describeError(error)}` }
      return
    }

    if (!response.ok) {
      yield { type: 'error', message: `代理返回 ${response.status}` }
      return
    }
    if (!response.body) {
      yield { type: 'error', message: '响应没有可读的流' }
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const event = parseSseLine(line)
          if (event) yield event
        }
      }

      const tail = parseSseLine(buffer)
      if (tail) yield tail

      yield { type: 'done' }
    } catch (error) {
      yield { type: 'error', message: `读取流失败：${describeError(error)}` }
    } finally {
      reader.releaseLock()
    }
  }
}

/** 解析一行 SSE；非数据行、[DONE] 与结构异常的分片一律忽略。 */
function parseSseLine(line: string): StreamEvent | null {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith(':')) return null
  if (!trimmed.startsWith('data:')) return null

  const payload = trimmed.slice('data:'.length).trim()
  if (payload === '' || payload === '[DONE]') return null

  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return null
  }

  const text = extractDeltaText(parsed)
  return text === '' ? null : { type: 'delta', text }
}

/** 从 OpenAI 兼容的响应分片中取出增量文本；结构不符时返回空串。 */
function extractDeltaText(payload: unknown): string {
  if (!isRecord(payload)) return ''

  const choices = payload['choices']
  if (!Array.isArray(choices)) return ''

  const first = choices[0]
  if (!isRecord(first)) return ''

  const delta = first['delta']
  if (!isRecord(delta)) return ''

  const content = delta['content']
  return typeof content === 'string' ? content : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
