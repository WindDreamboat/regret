import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_DIRECT_MODEL } from '../../core/llm/config'
import type { ChatMessage, StreamEvent } from '../../core/llm/protocol'
import { DeepSeekAdapter, type FetchLike } from './DeepSeekAdapter'

const messages: ChatMessage[] = [{ role: 'user', content: '在吗' }]

/** 用给定的文本分片构造 SSE 响应，分片边界可任意切割事件 */
function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, { status })
}

function deltaChunk(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`
}

async function collect(events: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const collected: StreamEvent[] = []
  for await (const event of events) collected.push(event)
  return collected
}

function adapterOf(outcome: Response | Error): DeepSeekAdapter {
  const fetchImpl = vi.fn(async () => {
    if (outcome instanceof Error) throw outcome
    return outcome
  }) as unknown as FetchLike
  return new DeepSeekAdapter({ fetchImpl })
}

function textOf(events: StreamEvent[]): string {
  return events
    .filter((event): event is { type: 'delta'; text: string } => event.type === 'delta')
    .map((event) => event.text)
    .join('')
}

describe('DeepSeekAdapter', () => {
  it('拼接多个分片并以下发 done 结束', async () => {
    const adapter = adapterOf(
      sseResponse([deltaChunk('你'), deltaChunk('好'), 'data: [DONE]\n\n']),
    )

    const events = await collect(adapter.stream(messages))

    expect(textOf(events)).toBe('你好')
    expect(events.at(-1)).toEqual({ type: 'done' })
  })

  it('事件被分片切断时仍能正确缓冲还原', async () => {
    const whole = deltaChunk('你好')
    const adapter = adapterOf(sseResponse([whole.slice(0, 12), whole.slice(12)]))

    const events = await collect(adapter.stream(messages))

    expect(textOf(events)).toBe('你好')
  })

  it('忽略注释行与非 data 行', async () => {
    const adapter = adapterOf(
      sseResponse([': keep-alive\n\n', 'event: message\n', deltaChunk('嗨')]),
    )

    const events = await collect(adapter.stream(messages))

    expect(textOf(events)).toBe('嗨')
  })

  it('响应结构异常时跳过而不抛出', async () => {
    const adapter = adapterOf(
      sseResponse(['data: {"choices":[]}\n\n', 'data: 不是合法 JSON\n\n', deltaChunk('嗨')]),
    )

    const events = await collect(adapter.stream(messages))

    expect(textOf(events)).toBe('嗨')
    expect(events.some((event) => event.type === 'error')).toBe(false)
  })

  it('非 2xx 响应产生 error 事件', async () => {
    const adapter = adapterOf(sseResponse([], 401))

    const events = await collect(adapter.stream(messages))

    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('error')
  })

  it('请求失败时产生 error 事件而非抛出', async () => {
    const adapter = adapterOf(new Error('网络不可达'))

    const events = await collect(adapter.stream(messages))

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'error', message: expect.stringContaining('网络不可达') })
  })

  it('请求发往配置的端点', async () => {
    const fetchImpl = vi.fn(async () => sseResponse(['data: [DONE]\n\n'])) as unknown as FetchLike
    const adapter = new DeepSeekAdapter({ endpoint: '/custom', fetchImpl })

    await collect(adapter.stream(messages))

    expect(fetchImpl).toHaveBeenCalledWith('/custom', expect.objectContaining({ method: 'POST' }))
  })

  it('配置齐全时随请求头透传连接配置', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => sseResponse(['data: [DONE]\n\n']))
    const adapter = new DeepSeekAdapter({
      endpoint: 'https://p.example.com/api/chat',
      apiKey: 'sk-1',
      baseUrl: 'https://gw.example.com/v1',
      model: 'flash',
      fetchImpl,
    })

    await collect(adapter.stream(messages))

    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe('https://p.example.com/api/chat')
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-1',
      'X-Chat-Base-Url': 'https://gw.example.com/v1',
      'X-Chat-Model': 'flash',
    })
  })

  it('未配置连接配置时不多带任何请求头', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => sseResponse(['data: [DONE]\n\n']))
    const adapter = new DeepSeekAdapter({ fetchImpl })

    await collect(adapter.stream(messages))

    const [, init] = fetchImpl.mock.calls[0] ?? []
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('代理模式不把模型名与流式开关放进请求体，交给代理补', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => sseResponse(['data: [DONE]\n\n']))
    const adapter = new DeepSeekAdapter({ model: 'flash', fetchImpl })

    await collect(adapter.stream(messages))

    const [, init] = fetchImpl.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toEqual({ messages })
  })
})

describe('DeepSeekAdapter 直连模式', () => {
  const directRequest = async (options: { model?: string; endpoint?: string; apiKey?: string }) => {
    const fetchImpl = vi.fn<FetchLike>(async () => sseResponse(['data: [DONE]\n\n']))
    const adapter = new DeepSeekAdapter({
      mode: 'direct',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      ...options,
      fetchImpl,
    })

    await collect(adapter.stream(messages))

    const [url, init] = fetchImpl.mock.calls[0] ?? []
    return { url, init, fetchImpl }
  }

  it('模型名与流式开关由客户端写进请求体，只带 Authorization', async () => {
    const { url, init } = await directRequest({ model: 'deepseek-reasoner', apiKey: 'sk-1' })

    expect(url).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-1',
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'deepseek-reasoner',
      messages,
      stream: true,
    })
  })

  it('模型名留空时用直连默认值，且不发 X-Chat-* 头', async () => {
    const { init } = await directRequest({})

    expect(JSON.parse(String(init?.body)).model).toBe(DEFAULT_DIRECT_MODEL)
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('未填接口地址时不发请求，给出去设置页填写的提示', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => sseResponse(['data: [DONE]\n\n']))
    const adapter = new DeepSeekAdapter({ mode: 'direct', fetchImpl })

    const events = await collect(adapter.stream(messages))

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(events).toEqual([
      { type: 'error', message: expect.stringContaining('接口地址') },
    ])
  })

  it('接口非 2xx 时报「接口返回」，与代理模式的文案区分', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => sseResponse([], 401))
    const adapter = new DeepSeekAdapter({
      mode: 'direct',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      fetchImpl,
    })

    const events = await collect(adapter.stream(messages))

    expect(events).toEqual([{ type: 'error', message: '接口返回 401' }])
  })

  it('直连也解析 OpenAI 兼容的 SSE', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      sseResponse([deltaChunk('晚'), deltaChunk('上好'), 'data: [DONE]\n\n']),
    )
    const adapter = new DeepSeekAdapter({
      mode: 'direct',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      fetchImpl,
    })

    const events = await collect(adapter.stream(messages))

    expect(textOf(events)).toBe('晚上好')
    expect(events.at(-1)).toEqual({ type: 'done' })
  })
})

describe('DeepSeekAdapter 原生回退', () => {
  const corsBlocked = new TypeError('Failed to fetch')

  it('浏览器被跨域拦下时，改由原生传输把请求发出去', async () => {
    const nativeFetch = vi.fn<FetchLike>(async () =>
      sseResponse([deltaChunk('原生'), deltaChunk('也能通'), 'data: [DONE]\n\n']),
    )
    const adapter = new DeepSeekAdapter({
      mode: 'direct',
      endpoint: 'https://gateway.example.com/api/v1/chat/completions',
      nativeFetch,
      fetchImpl: vi.fn<FetchLike>(async () => {
        throw corsBlocked
      }),
    })

    const events = await collect(adapter.stream(messages))

    expect(textOf(events)).toBe('原生也能通')
    expect(events.at(-1)).toEqual({ type: 'done' })
  })

  it('回退时把同一份请求头与请求体交给原生层', async () => {
    const nativeFetch = vi.fn<FetchLike>(async () => sseResponse(['data: [DONE]\n\n']))
    const fetchImpl = vi.fn<FetchLike>(async () => {
      throw corsBlocked
    })
    const adapter = new DeepSeekAdapter({
      mode: 'direct',
      endpoint: 'https://gateway.example.com/api/v1/chat/completions',
      apiKey: 'sk-1',
      nativeFetch,
      fetchImpl,
    })

    await collect(adapter.stream(messages))

    const [, init] = nativeFetch.mock.calls[0] ?? []
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-1',
    })
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: DEFAULT_DIRECT_MODEL,
      stream: true,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('浏览器 fetch 正常时不走原生层——逐字流优先', async () => {
    const nativeFetch = vi.fn<FetchLike>(async () => sseResponse([deltaChunk('不该出现')]))
    const adapter = new DeepSeekAdapter({
      mode: 'direct',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      nativeFetch,
      fetchImpl: vi.fn<FetchLike>(async () => sseResponse([deltaChunk('浏览器'), 'data: [DONE]\n\n'])),
    })

    const events = await collect(adapter.stream(messages))

    expect(textOf(events)).toBe('浏览器')
    expect(nativeFetch).not.toHaveBeenCalled()
  })

  it('相对地址（代理模式的默认 /api/chat）不回退，直接报错', async () => {
    const nativeFetch = vi.fn<FetchLike>(async () => sseResponse(['data: [DONE]\n\n']))
    const adapter = new DeepSeekAdapter({
      nativeFetch,
      fetchImpl: vi.fn<FetchLike>(async () => {
        throw corsBlocked
      }),
    })

    const events = await collect(adapter.stream(messages))

    expect(nativeFetch).not.toHaveBeenCalled()
    expect(events).toEqual([{ type: 'error', message: '请求失败：Failed to fetch' }])
  })

  it('原生传输也失败时同样给出可读错误', async () => {
    const nativeFetch = vi.fn<FetchLike>(async () => {
      throw new Error('Unable to resolve host')
    })
    const adapter = new DeepSeekAdapter({
      mode: 'direct',
      endpoint: 'https://gateway.example.com/api/v1/chat/completions',
      nativeFetch,
      fetchImpl: vi.fn<FetchLike>(async () => {
        throw corsBlocked
      }),
    })

    const events = await collect(adapter.stream(messages))

    expect(events).toEqual([{ type: 'error', message: '请求失败：Unable to resolve host' }])
  })
})
