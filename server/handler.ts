import { CHAT_CONFIG_HEADERS } from '../src/core/llm/config.ts'
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
 *
 * 连接配置（Key / 网关 / 模型）优先取客户端随请求头透传的值，其次取环境变量，
 * 因此「设置页直填」与「只读代理侧 .env」两种用法并存。
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

    // 优先级：客户端请求头 > 环境变量。头缺失或空白即视为未提供，交由下一级回退。
    const apiKey = readClientApiKey(request) ?? env['DEEPSEEK_API_KEY']
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

    const baseUrl = (
      readHeader(request, CHAT_CONFIG_HEADERS.baseUrl) ??
      env['DEEPSEEK_BASE_URL'] ??
      DEFAULT_BASE_URL
    ).replace(/\/+$/, '')
    const model =
      readHeader(request, CHAT_CONFIG_HEADERS.model) ?? env['DEEPSEEK_MODEL'] ?? DEFAULT_MODEL
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

/**
 * 取请求头中的非空值；头缺失或全为空白时返回 undefined，表示「未提供」。
 *
 * 空串必须与缺失同样对待，否则客户端留空的字段会覆盖掉环境变量。
 */
function readHeader(request: Request, name: string): string | undefined {
  const value = request.headers.get(name)?.trim()
  return value === undefined || value === '' ? undefined : value
}

/** 从 Authorization 头取 Bearer 令牌；缺失、为空或非 Bearer 形式均返回 undefined。 */
function readClientApiKey(request: Request): string | undefined {
  const header = readHeader(request, CHAT_CONFIG_HEADERS.apiKey)
  if (header === undefined || !header.startsWith('Bearer ')) return undefined

  const token = header.slice('Bearer '.length).trim()
  return token === '' ? undefined : token
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
      // Authorization 与两个自定义头不在 CORS 安全名单内，不声明浏览器会拒绝预检
      'Access-Control-Allow-Headers': [
        'Content-Type',
        CHAT_CONFIG_HEADERS.apiKey,
        CHAT_CONFIG_HEADERS.baseUrl,
        CHAT_CONFIG_HEADERS.model,
      ].join(', '),
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
