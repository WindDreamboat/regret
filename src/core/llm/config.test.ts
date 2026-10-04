import { describe, expect, it } from 'vitest'
import { CHAT_CONFIG_HEADERS, DEFAULT_CHAT_CONFIG, normalizeChatConfig } from './config'

describe('normalizeChatConfig', () => {
  it('非对象整体退回默认', () => {
    for (const input of [null, undefined, 'x', 1, true]) {
      expect(normalizeChatConfig(input)).toEqual(DEFAULT_CHAT_CONFIG)
    }
  })

  it('provider 非枚举值退回 mock，deepseek 原样保留', () => {
    expect(normalizeChatConfig({ provider: 'hacker' }).provider).toBe('mock')
    expect(normalizeChatConfig({ provider: 'mock' }).provider).toBe('mock')
    expect(normalizeChatConfig({ provider: 'deepseek' }).provider).toBe('deepseek')
  })

  it('文本字段去空白，缺失字段为空串', () => {
    expect(
      normalizeChatConfig({
        endpoint: '  /api/chat  ',
        apiKey: '  sk-1  ',
        baseUrl: ' https://api.example.com ',
        model: ' flash ',
      }),
    ).toEqual({
      provider: 'mock',
      endpoint: '/api/chat',
      apiKey: 'sk-1',
      baseUrl: 'https://api.example.com',
      model: 'flash',
    })

    expect(normalizeChatConfig({})).toEqual(DEFAULT_CHAT_CONFIG)
  })

  it('非字符串字段归空', () => {
    const config = normalizeChatConfig({ apiKey: 123, baseUrl: {}, model: ['x'] })

    expect(config.apiKey).toBe('')
    expect(config.baseUrl).toBe('')
    expect(config.model).toBe('')
  })

  it('超长字段被截断到上限', () => {
    const config = normalizeChatConfig({ apiKey: 'a'.repeat(3000) })

    expect(config.apiKey).toHaveLength(2048)
  })

  it('地址字段只接受 http(s) 绝对地址与 / 开头的相对路径', () => {
    expect(normalizeChatConfig({ endpoint: 'https://p.example.com/api/chat' }).endpoint).toBe(
      'https://p.example.com/api/chat',
    )
    expect(normalizeChatConfig({ endpoint: 'http://localhost:5174/api/chat' }).endpoint).toBe(
      'http://localhost:5174/api/chat',
    )
    expect(normalizeChatConfig({ endpoint: '/api/chat' }).endpoint).toBe('/api/chat')

    for (const invalid of ['ftp://x', 'javascript:alert(1)', 'p.example.com/api/chat', 'api/chat']) {
      expect(normalizeChatConfig({ baseUrl: invalid }).baseUrl).toBe('')
    }
  })

  it('不修改入参', () => {
    const input = { provider: 'deepseek', endpoint: '  /x  ', apiKey: 'k' }
    const snapshot = { ...input }

    normalizeChatConfig(input)

    expect(input).toEqual(snapshot)
  })
})

describe('CHAT_CONFIG_HEADERS', () => {
  it('头名固定', () => {
    expect(CHAT_CONFIG_HEADERS).toEqual({
      apiKey: 'Authorization',
      baseUrl: 'X-Chat-Base-Url',
      model: 'X-Chat-Model',
    })
  })
})