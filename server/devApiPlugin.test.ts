import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadProxyEnv, toRequestHeaders } from './devApiPlugin.ts'

describe('toRequestHeaders', () => {
  it('转发设置页连接配置所依赖的头', () => {
    const headers = toRequestHeaders({
      'content-type': 'application/json',
      origin: 'https://localhost',
      authorization: 'Bearer sk-from-page',
      'x-chat-base-url': 'https://gateway.example.com/v1',
      'x-chat-model': 'deepseek-chat',
    })

    expect(headers.get('Authorization')).toBe('Bearer sk-from-page')
    expect(headers.get('X-Chat-Base-Url')).toBe('https://gateway.example.com/v1')
    expect(headers.get('X-Chat-Model')).toBe('deepseek-chat')
    expect(headers.get('Origin')).toBe('https://localhost')
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('丢弃逐跳头与长度相关头，避免与重建的 body 冲突', () => {
    const headers = toRequestHeaders({
      host: 'localhost:5173',
      connection: 'keep-alive',
      'content-length': '42',
      'transfer-encoding': 'chunked',
      'x-chat-model': 'deepseek-chat',
    })

    expect(headers.get('Host')).toBeNull()
    expect(headers.get('Connection')).toBeNull()
    expect(headers.get('Content-Length')).toBeNull()
    expect(headers.get('Transfer-Encoding')).toBeNull()
    expect(headers.get('X-Chat-Model')).toBe('deepseek-chat')
  })

  it('重复头合并为单值', () => {
    expect(toRequestHeaders({ 'x-chat-model': ['a', 'b'] }).get('X-Chat-Model')).toBe('a, b')
  })
})

describe('loadProxyEnv', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  function tempRoot(envFile: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'regret-proxy-env-'))
    writeFileSync(join(dir, '.env'), envFile, 'utf8')
    dirs.push(dir)
    return dir
  }

  it('读到没有 VITE_ 前缀的代理变量（默认前缀会漏掉 DEEPSEEK_API_KEY）', () => {
    const root = tempRoot('REGRET_PROXY_PROBE=sk-proxy\n')
    expect(loadProxyEnv('development', root)['REGRET_PROXY_PROBE']).toBe('sk-proxy')
  })

  it('多个代理变量一并读出：Key、网关、模型与来源白名单', () => {
    const root = tempRoot(
      [
        'REGRET_PROXY_KEY=sk-proxy',
        'REGRET_PROXY_BASE=https://gateway.example.com/v1',
        'REGRET_PROXY_MODEL=deepseek-chat',
        'REGRET_PROXY_ORIGIN=https://localhost',
        '',
      ].join('\n'),
    )
    const env = loadProxyEnv('development', root)

    expect(env['REGRET_PROXY_KEY']).toBe('sk-proxy')
    expect(env['REGRET_PROXY_BASE']).toBe('https://gateway.example.com/v1')
    expect(env['REGRET_PROXY_MODEL']).toBe('deepseek-chat')
    expect(env['REGRET_PROXY_ORIGIN']).toBe('https://localhost')
  })

  it('目录内没有 .env 时不报错，返回空记录', () => {
    const dir = mkdtempSync(join(tmpdir(), 'regret-proxy-env-'))
    dirs.push(dir)
    expect(loadProxyEnv('development', dir)['REGRET_PROXY_PROBE']).toBeUndefined()
  })
})
