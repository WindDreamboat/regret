import { beforeEach, describe, expect, it, vi } from 'vitest'

/** 平台与插件都做成可变的假件，便于在同一份用例里切换「Web / 原生」 */
const platform = vi.hoisted(() => ({ native: false }))
const request = vi.hoisted(() => vi.fn())

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => platform.native },
  CapacitorHttp: { request },
}))

const { createNativeFetch } = await import('./nativeFetch')

const SSE = 'data: {"choices":[{"delta":{"content":"晚"}}]}\n\ndata: [DONE]\n\n'

function okResponse(data: unknown, headers: Record<string, string> = {}) {
  return { data, status: 200, url: 'https://gateway.example.com/v1/chat/completions', headers }
}

describe('createNativeFetch', () => {
  beforeEach(() => {
    platform.native = false
    request.mockReset()
    request.mockResolvedValue(okResponse(SSE, { 'content-type': 'text/event-stream' }))
  })

  it('Web 上没有原生传输，返回 undefined', () => {
    expect(createNativeFetch()).toBeUndefined()
  })

  it('原生平台把请求原样交给宿主：地址、方法、头与请求体', async () => {
    platform.native = true
    const nativeFetch = createNativeFetch()
    expect(nativeFetch).toBeDefined()

    await nativeFetch?.('https://gateway.example.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sk-1' },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [] }),
    })

    expect(request).toHaveBeenCalledTimes(1)
    const options = request.mock.calls[0]?.[0] as Record<string, unknown>
    expect(options['url']).toBe('https://gateway.example.com/v1/chat/completions')
    expect(options['method']).toBe('POST')
    expect(options['headers']).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-1',
    })
    expect(JSON.parse(String(options['data']))).toMatchObject({ model: 'deepseek-chat' })
    // 网关实测偶发 40 s 以上才回包，读取超时必须给够
    expect(options['readTimeout']).toBeGreaterThan(60_000)
  })

  it('把整包响应还原成 Response，状态码与原响应头保留', async () => {
    platform.native = true
    request.mockResolvedValue(okResponse(SSE, { 'content-type': 'text/event-stream' }))
    const nativeFetch = createNativeFetch()

    const response = await nativeFetch?.('https://gateway.example.com/v1/chat/completions', {
      method: 'POST',
    })

    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toBe('text/event-stream')
    // SSE 文本原样保留：适配器仍按  data:  行解析
    await expect(response?.text()).resolves.toBe(SSE)
  })

  it('厂商回 JSON 错误体时也还原成 Response（状态码照传，交给调用方判断）', async () => {
    platform.native = true
    request.mockResolvedValue({
      data: { error: 'invalid api key' },
      status: 401,
      url: 'https://gateway.example.com/v1/chat/completions',
      headers: { 'content-type': 'application/json' },
    })

    const response = await createNativeFetch()?.('https://gateway.example.com/v1/chat/completions', {
      method: 'POST',
    })

    expect(response?.status).toBe(401)
    await expect(response?.text()).resolves.toBe('{"error":"invalid api key"}')
  })

  it('原生请求自身失败时向上抛，由适配器转成错误事件', async () => {
    platform.native = true
    request.mockRejectedValue(new Error('Unable to resolve host'))

    await expect(
      createNativeFetch()?.('https://gateway.example.com/v1/chat/completions', { method: 'POST' }),
    ).rejects.toThrow('Unable to resolve host')
  })

  it('同域重定向自动跟随：最常见的是厂商把 http 跳成 https', async () => {
    platform.native = true
    request
      .mockResolvedValueOnce({
        data: '',
        status: 307,
        url: 'http://gateway.example.com/v1/chat/completions',
        headers: { location: 'https://gateway.example.com/v1/chat/completions' },
      })
      .mockResolvedValueOnce(okResponse(SSE, { 'content-type': 'text/event-stream' }))

    const response = await createNativeFetch()?.('http://gateway.example.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sk-1' },
      body: '{"model":"x"}',
    })

    expect(response?.status).toBe(200)
    await expect(response?.text()).resolves.toBe(SSE)

    // 第二跳打到新地址，方法、请求头与请求体原样保留（307 的语义）
    expect(request).toHaveBeenCalledTimes(2)
    const second = request.mock.calls[1]?.[0] as Record<string, unknown>
    expect(second['url']).toBe('https://gateway.example.com/v1/chat/completions')
    expect(second['method']).toBe('POST')
    expect(second['data']).toBe('{"model":"x"}')
    expect(second['headers']).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-1',
    })
  })

  it('相对地址的 Location 也能跟随', async () => {
    platform.native = true
    request
      .mockResolvedValueOnce({
        data: '',
        status: 301,
        url: 'https://gateway.example.com/v1/chat/completions',
        headers: { location: '/chat/completions' },
      })
      .mockResolvedValueOnce(okResponse(SSE))

    await createNativeFetch()?.('https://gateway.example.com/v1/chat/completions', { method: 'POST' })

    expect(request.mock.calls[1]?.[0]).toMatchObject({
      url: 'https://gateway.example.com/chat/completions',
    })
  })

  it('跨域重定向不跟随：不把密钥送去另一个域，并告诉用户该填哪个地址', async () => {
    platform.native = true
    request.mockResolvedValue({
      data: '',
      status: 307,
      url: 'https://gateway.example.com/v1/chat/completions',
      headers: { location: 'https://evil.example.net/v1/chat/completions' },
    })

    await expect(
      createNativeFetch()?.('https://gateway.example.com/v1/chat/completions', { method: 'POST' }),
    ).rejects.toThrow('接口被重定向到 https://evil.example.net/v1/chat/completions')

    expect(request).toHaveBeenCalledTimes(1)
  })

  it('重定向成环时在跳数上限处停下，而不是无限打请求', async () => {
    platform.native = true
    request.mockResolvedValue({
      data: '',
      status: 307,
      url: 'https://gateway.example.com/v1/chat/completions',
      headers: { location: 'https://gateway.example.com/v1/chat/completions?round=2' },
    })

    await expect(
      createNativeFetch()?.('https://gateway.example.com/v1/chat/completions', { method: 'POST' }),
    ).rejects.toThrow('重定向超过')

    expect(request).toHaveBeenCalledTimes(4)
  })
})
