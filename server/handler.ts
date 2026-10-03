import type { ChatMessage, Role } from '../src/core/llm/protocol.ts'

/** 最小 fetch 依赖，便于测试注入 */
export type HttpFetch = (input: string, init: RequestInit) => Promise<Response>

export interface ChatHandlerOptions {
  /** 环境变量来源，默认 process.env */
  env?: Record<string, string | undefined>
  fetchImpl?: HttpFetch
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-flash'

/** 允许跨源的来源白名单默认值：打包后的 Capacitor WebView 来源 */
const DEFAULT_ALLOWED_ORIGIN = 'https://localhost'

const ROLES: readonly Role[] = ['system', 'user', 'assistant']

/**
 * 创建 /api/chat 的请求处理器。
 *
 * 基于 Web 标准 Request / Response 编写，因此同一份代码既能被 Vite dev server
 * 挂载，也能直接部署为 serverless function，前端无需感知差别。
 * API Key 只在此处读取，不会进入前端产物。
 *
 * 打包成 App 后 WebView 来源与代理不同源，浏览器会先发 OPTIONS 预检；
 * 因此这里必须处理预检并回 CORS 头，否则打包版一条消息都发不出去。
 */
export function createChatHandler(options: ChatHandlerOptions = {}) {
  const env = options.env ?? process.env
  const fetchImpl: HttpFetch = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init))

  return async function handleChat(request: Request): Promise<Response> {
    // 预检必须在方法校验之前处理，否则会被 405 拒绝
    if (request.method === 'OPTIONS') {
      return preflightResponse(resolveAllowedOrigin(request, env))
    }

    const origin = resolveAllowedOrigin(request, env)

    if (request.method !== 'POST') {
      return jsonResponse(405, { error: '仅支持 POST' }, origin)
    }

    const apiKey = env['DEEPSEEK_API_KEY']
    if (!apiKey) {
      return jsonResponse(500, { error: '代理未配置 DEEPSEEK_API_KEY' }, origin)
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return jsonResponse(400, { error: '请求体不是合法 JSON' }, origin)
    }

    const messages = extractMessages(payload)
    if (!messages) {
      return jsonResponse(400, { error: 'messages 缺失或结构非法' }, origin)
    }

    const baseUrl = (env['DEEPSEEK_BASE_URL'] ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    const model = env['DEEPSEEK_MODEL'] ?? DEFAULT_MODEL
    // Base URL 可能已包含 /v1（多数 OpenAI 兼容网关如此），此时不再重复拼接
    const path = baseUrl.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions'

    let upstream: Response
    try {
      upstream = await fetchImpl(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages, stream: true }),
      })
    } catch (error) {
      return jsonResponse(502, { error: `上游请求失败：${describeError(error)}` }, origin)
    }

    if (!upstream.ok || !upstream.body) {
      return jsonResponse(
        upstream.status === 200 ? 502 : upstream.status,
        { error: `上游返回 ${upstream.status}` },
        origin,
      )
    }

    // 原样透传 SSE，代理不做解析，避免流式链路出错；CORS 头必须一并带上
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        ...corsHeaders(origin),
      },
    })
  }
}

/** 取出与白名单匹配的请求来源；无 Origin 头或不在白名单时返回 null。 */
function resolveAllowedOrigin(
  request: Request,
  env: Record<string, string | undefined>,
): string | null {
  const origin = request.headers.get('Origin')
  if (origin === null) return null

  const allowed = (env['CHAT_ALLOWED_ORIGIN'] ?? DEFAULT_ALLOWED_ORIGIN)
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')

  return allowed.includes(origin) ? origin : null
}

/** 允许来源确定时才回 CORS 头；`Vary` 保证按来源缓存的正确性。 */
function corsHeaders(origin: string | null): Record<string, string> {
  if (origin === null) return {}
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
}

function preflightResponse(origin: string | null): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}

function jsonResponse(status: number, payload: unknown, origin: string | null = null): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  })
}

/** 校验不可信入参，取出消息数组；结构非法时返回 null。 */
function extractMessages(payload: unknown): ChatMessage[] | null {
  if (!isRecord(payload)) return null

  const messages = payload['messages']
  if (!Array.isArray(messages) || messages.length === 0) return null

  const result: ChatMessage[] = []
  for (const item of messages) {
    if (!isRecord(item)) return null

    const role = item['role']
    const content = item['content']
    if (typeof role !== 'string' || !ROLES.includes(role as Role)) return null
    if (typeof content !== 'string') return null

    result.push({ role: role as Role, content })
  }
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
