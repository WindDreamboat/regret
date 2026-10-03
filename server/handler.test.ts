import { describe, expect, it, vi } from 'vitest'
import { createChatHandler, type HttpFetch } from './handler'

const env = {
  DEEPSEEK_API_KEY: 'sk-test-secret',
  DEEPSEEK_BASE_URL: 'https://api.example.com',
  DEEPSEEK_MODEL: 'test-model',
}

const validBody = { messages: [{ role: 'user', content: '在吗' }] }

function postRequest(body: unknown): Request {
  return new Request('https://app.test/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

/** 带 Origin 的请求，用于验证跨源（打包后的 WebView）能否通过预检 */
function corsRequest(method: string, origin: string, body?: unknown): Request {
  return new Request('https://app.test/api/chat', {
    method,
    headers: { 'Content-Type': 'application/json', Origin: origin },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

function sseUpstream(): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"嗨"}}]}\n\n'))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

describe('createChatHandler', () => {
  it('拒绝非 POST 请求', async () => {
    const handler = createChatHandler({ env, fetchImpl: vi.fn<HttpFetch>() })

    const response = await handler(new Request('https://app.test/api/chat'))

    expect(response.status).toBe(405)
  })

  it('未配置密钥时返回 500，且不发起上游请求', async () => {
    const fetchImpl = vi.fn<HttpFetch>()
    const handler = createChatHandler({ env: { ...env, DEEPSEEK_API_KEY: '' }, fetchImpl })

    const response = await handler(postRequest(validBody))

    expect(response.status).toBe(500)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('请求体不是合法 JSON 时返回 400', async () => {
    const handler = createChatHandler({ env, fetchImpl: vi.fn<HttpFetch>() })

    const response = await handler(postRequest('不是 JSON'))

    expect(response.status).toBe(400)
  })

  it('messages 缺失或结构非法时返回 400', async () => {
    const handler = createChatHandler({ env, fetchImpl: vi.fn<HttpFetch>() })

    expect((await handler(postRequest({}))).status).toBe(400)
    expect((await handler(postRequest({ messages: [] }))).status).toBe(400)
    expect(
      (await handler(postRequest({ messages: [{ role: 'hacker', content: 'x' }] }))).status,
    ).toBe(400)
    expect((await handler(postRequest({ messages: [{ role: 'user', content: 1 }] }))).status).toBe(
      400,
    )
  })

  it('转发到上游，并带上密钥、模型与流式开关', async () => {
    const fetchImpl = vi.fn<HttpFetch>(async () => sseUpstream())
    const handler = createChatHandler({ env, fetchImpl })

    await handler(postRequest(validBody))

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer sk-test-secret' })
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'test-model',
      messages: validBody.messages,
      stream: true,
    })
  })

  it('Base URL 已带 /v1 时不再重复拼接', async () => {
    const fetchImpl = vi.fn<HttpFetch>(async () => sseUpstream())
    const handler = createChatHandler({
      env: { ...env, DEEPSEEK_BASE_URL: 'https://gw.example.com/v1' },
      fetchImpl,
    })

    await handler(postRequest(validBody))

    const [url] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe('https://gw.example.com/v1/chat/completions')
  })

  it('Base URL 以 /v1/ 结尾时同样只保留一个 /v1', async () => {
    const fetchImpl = vi.fn<HttpFetch>(async () => sseUpstream())
    const handler = createChatHandler({
      env: { ...env, DEEPSEEK_BASE_URL: 'https://gw.example.com/v1/' },
      fetchImpl,
    })

    await handler(postRequest(validBody))

    const [url] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe('https://gw.example.com/v1/chat/completions')
  })

  it('原样透传上游的流式响应', async () => {
    const handler = createChatHandler({ env, fetchImpl: async () => sseUpstream() })

    const response = await handler(postRequest(validBody))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/event-stream')
    expect(await response.text()).toContain('"content":"嗨"')
  })

  it('上游返回错误状态时透传状态码而非抛出', async () => {
    const handler = createChatHandler({
      env,
      fetchImpl: async () => new Response('nope', { status: 429 }),
    })

    expect((await handler(postRequest(validBody))).status).toBe(429)
  })

  it('上游请求抛出异常时返回 502', async () => {
    const handler = createChatHandler({
      env,
      fetchImpl: async () => {
        throw new Error('连接超时')
      },
    })

    const response = await handler(postRequest(validBody))

    expect(response.status).toBe(502)
  })

  it('响应体不包含密钥', async () => {
    const handler = createChatHandler({
      env,
      fetchImpl: async () => new Response('boom', { status: 500 }),
    })

    const response = await handler(postRequest(validBody))

    expect(await response.text()).not.toContain('sk-test-secret')
  })
})

describe('createChatHandler 跨源（打包后的 WebView）', () => {
  it('OPTIONS 预检返回 204 并带上允许来源与请求头白名单', async () => {
    const handler = createChatHandler({ env, fetchImpl: vi.fn<HttpFetch>() })

    const response = await handler(corsRequest('OPTIONS', 'https://localhost'))

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost')
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type')
    expect(response.headers.get('Vary')).toBe('Origin')
  })

  it('预检不发起上游请求', async () => {
    const fetchImpl = vi.fn<HttpFetch>()
    const handler = createChatHandler({ env, fetchImpl })

    await handler(corsRequest('OPTIONS', 'https://localhost'))

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('POST 响应同样带允许来源，流式响应也不例外', async () => {
    const handler = createChatHandler({ env, fetchImpl: async () => sseUpstream() })

    const response = await handler(corsRequest('POST', 'https://localhost', validBody))

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost')
    expect(await response.text()).toContain('"content":"嗨"')
  })

  it('来源不在白名单时不返回允许来源，浏览器据此拦截', async () => {
    const handler = createChatHandler({ env, fetchImpl: async () => sseUpstream() })

    const preflight = await handler(corsRequest('OPTIONS', 'https://evil.example'))
    const post = await handler(corsRequest('POST', 'https://evil.example', validBody))

    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(post.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('无 Origin 头（同源或非浏览器）时不注入 CORS 头', async () => {
    const handler = createChatHandler({ env, fetchImpl: async () => sseUpstream() })

    const response = await handler(postRequest(validBody))

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('白名单可由环境变量配置且支持多个来源', async () => {
    const handler = createChatHandler({
      env: { ...env, CHAT_ALLOWED_ORIGIN: 'https://a.example, https://b.example' },
      fetchImpl: vi.fn<HttpFetch>(),
    })

    const allowed = await handler(corsRequest('OPTIONS', 'https://b.example'))
    const denied = await handler(corsRequest('OPTIONS', 'https://localhost'))

    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://b.example')
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
