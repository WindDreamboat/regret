import { describe, expect, it } from 'vitest'
import type { Speaker } from '../../core/llm/protocol'
import type { StoredMessage } from '../../core/memory/types'
import { InMemoryStore } from './InMemoryStore'

function message(content: string, ts: number, sessionId = 's1', role: Speaker = 'user'): StoredMessage {
  return { sessionId, role, content, ts }
}

describe('InMemoryStore', () => {
  it('按时间升序返回消息', async () => {
    const store = new InMemoryStore()
    await store.appendMessage(message('后', 200))
    await store.appendMessage(message('先', 100))

    const result = await store.listMessages('s1')

    expect(result.map((item) => item.content)).toEqual(['先', '后'])
  })

  it('按会话隔离消息', async () => {
    const store = new InMemoryStore()
    await store.appendMessage(message('属于 s1', 100, 's1'))
    await store.appendMessage(message('属于 s2', 200, 's2'))

    expect((await store.listMessages('s1')).map((item) => item.content)).toEqual(['属于 s1'])
    expect((await store.listMessages('s2')).map((item) => item.content)).toEqual(['属于 s2'])
  })

  it('清空指定会话时不影响其他会话', async () => {
    const store = new InMemoryStore()
    await store.appendMessage(message('a', 100, 's1'))
    await store.appendMessage(message('b', 200, 's2'))

    await store.clearSession('s1')

    expect(await store.listMessages('s1')).toEqual([])
    expect(await store.listMessages('s2')).toHaveLength(1)
  })

  it('返回的是副本，外部修改不影响内部数据', async () => {
    const store = new InMemoryStore()
    await store.appendMessage(message('原文', 100))

    const result = await store.listMessages('s1')
    result[0]!.content = '被篡改'

    expect((await store.listMessages('s1'))[0]?.content).toBe('原文')
  })
})
