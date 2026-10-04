import type { ChatProvider } from '../../core/llm/ChatProvider'
import {
  CHAT_CONFIG_HEADERS,
  DEFAULT_DIRECT_MODEL,
  resolveDirectEndpoint,
} from '../../core/llm/config'
import type { ChatMessage, StreamEvent } from '../../core/llm/protocol'

/** 最小 fetch 依赖，便于测试注入 */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

/**
 * 请求协议：`proxy` 走自建代理（默认），`direct` 直连厂商接口。
 *
 * 两者都是 OpenAI 兼容的 SSE，因此解析逻辑共用，差别只在请求怎么发。
 */
export type ChatProviderMode = 'proxy' | 'direct'

export interface DeepSeekAdapterOptions {
  /** 代理模式下的代理端点，默认 /api/chat；直连模式下是厂商的完整接口地址 */
  endpoint?: string
  /** API Key；代理模式下非空时随请求头透传，直连模式下即 Bearer 令牌 */
  apiKey?: string
  /** 上游网关地址；仅代理模式使用，非空时随请求头透传 */
  baseUrl?: string
  /** 模型名；代理模式下随请求头透传，直连模式下写进请求体 */
  model?: string
  /** 请求协议，默认 `proxy` */
  mode?: ChatProviderMode
  /**
   * 浏览器 fetch 失败（跨域被拦或网络错误）时的原生回退传输。
   *
   * 原生请求没有同源策略，因此不支持 CORS 的厂商也能直连；但它整包返回、拿不到逐字流，
   * 所以只在浏览器这条路走不通时启用。用 `createNativeFetch()` 构造，Web 上为 `undefined`。
   */
  nativeFetch?: FetchLike
  fetchImpl?: FetchLike
}

const DEFAULT_PROXY_ENDPOINT = '/api/chat'

/**
 * 对话提供方适配器。
 *
 * 支持两种发法，都解析 OpenAI 兼容的 SSE：
 *
 * - `proxy`：请求发往自建代理。连接配置（Key / 网关 / 模型）由设置页提供，非空时随请求头
 *   透传、覆盖代理侧环境变量；为空则不发送该头，由代理回退。
 * - `direct`：请求直发厂商接口，不经过任何中间层，因此模型名与 `stream` 必须由客户端
 *   自己写进请求体，且只发 `Authorization`——`X-Chat-*` 是自建代理的约定，发给厂商只会
 *   多触发一次预检。代价是 Key 必须保存在设备上。
 */
export class DeepSeekAdapter implements ChatProvider {
  private readonly endpoint: string
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly model: string
  private readonly mode: ChatProviderMode
  private readonly nativeFetch: FetchLike | undefined
  private readonly fetchImpl: FetchLike

  constructor(options: DeepSeekAdapterOptions = {}) {
    this.mode = options.mode ?? 'proxy'
    this.nativeFetch = options.nativeFetch
    // 直连时允许只填网关地址：按与代理同一套规则补成完整接口地址（见 resolveDirectEndpoint）
    // 相对路径的默认值只在代理模式成立：打包成 App 后 WebView 解析不了相对路径，
    // 直连模式留空即视为未配置，交给 stream() 给出可读的错误提示。
    const endpoint = options.endpoint ?? (this.mode === 'direct' ? '' : DEFAULT_PROXY_ENDPOINT)
    this.endpoint = this.mode === 'direct' ? resolveDirectEndpoint(endpoint) : endpoint
    this.apiKey = options.apiKey ?? ''
    this.baseUrl = options.baseUrl ?? ''
    this.model = options.model ?? ''
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init))
  }

  /** 空的连接配置不发送对应头，代理模式下未配置时请求与引入前逐字节一致。 */
  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey !== '') headers[CHAT_CONFIG_HEADERS.apiKey] = `Bearer ${this.apiKey}`

    if (this.mode === 'proxy') {
      if (this.baseUrl !== '') headers[CHAT_CONFIG_HEADERS.baseUrl] = this.baseUrl
      if (this.model !== '') headers[CHAT_CONFIG_HEADERS.model] = this.model
    }
    return headers
  }

  /**
   * 发请求。
   *
   * 先走浏览器 fetch——那是唯一能拿到逐字流的通道。被跨域拦下（厂商没回 CORS 头）或网络
   * 出错时，若提供了原生传输就改由宿主 App 发请求。相对地址（代理模式的默认 `/api/chat`）
   * 不是能独立发出去的地址，只能交给浏览器，因此不参与回退。
   */
  private async send(messages: ChatMessage[]): Promise<Response> {
    const init: RequestInit = {
      method: 'POST',
      headers: this.headers(),
      body: this.body(messages),
    }

    try {
      return await this.fetchImpl(this.endpoint, init)
    } catch (error) {
      if (this.nativeFetch === undefined || !isAbsoluteUrl(this.endpoint)) throw error
      return await this.nativeFetch(this.endpoint, init)
    }
  }

  /**
   * 请求体。代理只负责转发，模型名与流式开关由代理补；直连时没有这一层，得自己带全，
   * 否则厂商会按自己的默认模型处理、还可能返回一次性响应。
   */
  private body(messages: ChatMessage[]): string {
    if (this.mode !== 'direct') return JSON.stringify({ messages })

    return JSON.stringify({
      model: this.model === '' ? DEFAULT_DIRECT_MODEL : this.model,
      messages,
      stream: true,
    })
  }

  async *stream(messages: ChatMessage[]): AsyncIterable<StreamEvent> {
    if (this.endpoint === '') {
      yield { type: 'error', message: '还没填接口地址：请在「设置 → 连接」里填写厂商的接口地址' }
      return
    }

    let response: Response
    try {
      response = await this.send(messages)
    } catch (error) {
      yield { type: 'error', message: `请求失败：${describeError(error)}` }
      return
    }

    if (!response.ok) {
      const source = this.mode === 'direct' ? '接口' : '代理'
      yield { type: 'error', message: `${source}返回 ${response.status}${redirectHint(response)}` }
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

/**
 * 3xx 时把目标地址带出来。
 *
 * 只报「接口返回 307」等于把排查甩给用户；把 `Location` 一并显示出来，他就能直接把设置里的
 * 地址改成厂商标明的那个（最常见的是厂商把 http 跳成 https）。
 */
function redirectHint(response: Response): string {
  if (response.status < 300 || response.status >= 400) return ''
  const location = response.headers.get('location')
  return location === null ? '（重定向，但未给出目标地址）' : `（重定向到 ${location}）`
}

/** 只有绝对地址才能直接交给原生层去发（相对地址得先有来源作为基准）。 */
function isAbsoluteUrl(endpoint: string): boolean {
  return endpoint.startsWith('https://') || endpoint.startsWith('http://')
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
