import { beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ native: false, available: true }))
const request = vi.hoisted(() => vi.fn(async (options: { id: string }) => ({ id: options.id })))
const abort = vi.hoisted(() => vi.fn(async () => {}))
const listeners = vi.hoisted(() => new Map<string, ((event: never) => void)[]>())

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    isPluginAvailable: () => platform.available,
  },
}))

vi.mock('@regret/stream-http', () => ({
  StreamHttp: {
    request,
    abort,
    addListener: async (name: string, listener: (event: never) => void) => {
      listeners.set(name, [...(listeners.get(name) ?? []), listener])
      return { remove: async () => {} }
    },
  },
}))

const { createNativeStreamFetch } = await import('./nativeStreamFetch')

/** 模拟原生层发事件；id 由被测代码生成，测试从 request 调用参数里取回 */
function emit(name: string, payload: unknown): void {
  for (const listener of listeners.get(name) ?? []) (listener as (event: unknown) => void)(payload)
}

let lastId = ''

const URL_ = 'https://gateway.example.com/v1/chat/completions'

describe('createNativeStreamFetch', () => {
  beforeEach(() => {
    platform.native = false
    platform.available = true
    // 不清 listeners：模块级只订阅一次（与被测代码的真实行为一致），清了反而收不到事件
    request.mockClear()
    request.mockImplementation(async (options: { id: string }) => {
      lastId = options.id
      return { id: options.id }
    })
    abort.mockClear()
  })

  it('Web 上没有原生流式传输，返回 undefined', () => {
    expect(createNativeStreamFetch()).toBeUndefined()
  })

  it('插件不可用时也返回 undefined（由整包回退接管）', () => {
    platform.native = true
    platform.available = false
    expect(createNativeStreamFetch()).toBeUndefined()
  })

  it('把 start/line/end 事件还原成流式 Response', async () => {
    platform.native = true
    const fetchImpl = createNativeStreamFetch()
    expect(fetchImpl).toBeDefined()

    const responsePromise = fetchImpl?.(URL_, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sk-1' },
      body: '{"model":"x"}',
    })

    // 原生层拿到响应头就开始吐，因此事件早于调用方 await 到 Response 是常态
    emit('streamStart', {
      id: lastId,
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
    emit('streamLine', { id: lastId, line: 'data: {"choices":[]}' })
    emit('streamLine', { id: lastId, line: '' })
    emit('streamLine', { id: lastId, line: 'data: [DONE]' })
    emit('streamEnd', { id: lastId })

    const response = await responsePromise
    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toBe('text/event-stream')
    // 一行一个事件，还原时补回换行，适配器的 SSE 解析照旧可用
    await expect(response?.text()).resolves.toBe('data: {"choices":[]}\n\ndata: [DONE]\n')
  })

  it('请求参数原样交给原生层', async () => {
    platform.native = true
    const fetchImpl = createNativeStreamFetch()
    void fetchImpl?.(URL_, {
      method: 'POST',
      headers: { Authorization: 'Bearer sk-1' },
      body: '{"model":"x"}',
    })

    expect(request.mock.calls[0]?.[0]).toMatchObject({
      url: URL_,
      method: 'POST',
      headers: { Authorization: 'Bearer sk-1' },
      data: '{"model":"x"}',
    })
  })

  it('还没吐出状态就失败时，调用方拿到的是抛错（由适配器转成错误文案）', async () => {
    platform.native = true
    const fetchImpl = createNativeStreamFetch()
    const responsePromise = fetchImpl?.(URL_, { method: 'POST' })

    emit('streamError', { id: lastId, message: 'Unable to resolve host' })

    await expect(responsePromise).rejects.toThrow('Unable to resolve host')
  })

  it('读到一半断流时，流以错误收尾而不是静默截断', async () => {
    platform.native = true
    const fetchImpl = createNativeStreamFetch()
    const responsePromise = fetchImpl?.(URL_, { method: 'POST' })

    emit('streamStart', { id: lastId, status: 200, headers: {} })
    emit('streamLine', { id: lastId, line: 'data: {"choices":[]}' })

    const response = await responsePromise
    const reader = response?.body?.getReader()
    const first = await reader?.read()
    expect(new TextDecoder().decode(first?.value)).toBe('data: {"choices":[]}\n')

    emit('streamError', { id: lastId, message: '连接被中断' })

    await expect(reader?.read()).rejects.toThrow('连接被中断')
  })

  it('取消读流会中断原生请求', async () => {
    platform.native = true
    const fetchImpl = createNativeStreamFetch()
    const responsePromise = fetchImpl?.(URL_, { method: 'POST' })

    emit('streamStart', { id: lastId, status: 200, headers: {} })
    const response = await responsePromise
    const reader = response?.body?.getReader()
    void reader?.read()
    await reader?.cancel()

    expect(abort).toHaveBeenCalledWith({ id: lastId })
  })

  it('非 2xx 也照传状态码，交给适配器决定怎么报错', async () => {
    platform.native = true
    const fetchImpl = createNativeStreamFetch()
    const responsePromise = fetchImpl?.(URL_, { method: 'POST' })

    emit('streamStart', {
      id: lastId,
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
    emit('streamLine', { id: lastId, line: '{"error":"invalid api key"}' })
    emit('streamEnd', { id: lastId })

    const response = await responsePromise
    expect(response?.status).toBe(401)
    await expect(response?.text()).resolves.toBe('{"error":"invalid api key"}\n')
  })
})
