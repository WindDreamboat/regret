import { describe, expect, it } from 'vitest'
import {
  CHAT_CONFIG_HEADERS,
  DEFAULT_CHAT_CONFIG,
  normalizeChatConfig,
  resolveDirectEndpoint,
} from './config'

describe('normalizeChatConfig', () => {
  it('非对象整体退回默认', () => {
    for (const input of [null, undefined, 'x', 1, true]) {
      expect(normalizeChatConfig(input)).toEqual(DEFAULT_CHAT_CONFIG)
    }
  })

  it('provider 枚举值原样保留', () => {
    for (const provider of ['mock', 'deepseek', 'direct'] as const) {
      expect(normalizeChatConfig({ provider }).provider).toBe(provider)
    }
  })

  it('provider 非枚举值退回 mock', () => {
    for (const invalid of ['hacker', 'Direct', '', 1, null, undefined]) {
      expect(normalizeChatConfig({ provider: invalid }).provider).toBe('mock')
    }
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

describe('resolveDirectEndpoint', () => {
  it('已经是完整接口地址就原样使用', () => {
    expect(resolveDirectEndpoint('https://api.deepseek.com/v1/chat/completions')).toBe(
      'https://api.deepseek.com/v1/chat/completions',
    )
    expect(resolveDirectEndpoint('https://gateway.example.com/chat/completions')).toBe(
      'https://gateway.example.com/chat/completions',
    )
  })

  it('补上遗漏的路径：与代理侧同一套规则', () => {
    // 真机上出现过的填法：只填到 /v1，厂商把它 307 跳到别处，界面只报一句状态码
    expect(resolveDirectEndpoint('https://gateway.example.com/api/v1')).toBe(
      'https://gateway.example.com/api/v1/chat/completions',
    )
    expect(resolveDirectEndpoint('https://api.deepseek.com')).toBe(
      'https://api.deepseek.com/v1/chat/completions',
    )
  })

  it('容忍尾斜杠与首尾空白', () => {
    expect(resolveDirectEndpoint('  https://api.deepseek.com/v1/  ')).toBe(
      'https://api.deepseek.com/v1/chat/completions',
    )
    expect(resolveDirectEndpoint('https://api.deepseek.com/v1/chat/completions/')).toBe(
      'https://api.deepseek.com/v1/chat/completions',
    )
  })

  it('空串原样返回，由调用方给出「还没填」的提示', () => {
    expect(resolveDirectEndpoint('')).toBe('')
    expect(resolveDirectEndpoint('   ')).toBe('')
  })

  it('纯函数：不改入参', () => {
    const input = 'https://api.deepseek.com/v1/'
    resolveDirectEndpoint(input)
    expect(input).toBe('https://api.deepseek.com/v1/')
  })
})