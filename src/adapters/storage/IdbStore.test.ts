import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { Speaker } from '../../core/llm/protocol'
import type { StoredMessage } from '../../core/memory/types'
import { IdbStore } from './IdbStore'

let databaseSeq = 0
function freshStore(): IdbStore {
  databaseSeq += 1
  return new IdbStore({ databaseName: `regret-test-${databaseSeq}` })
}

function message(content: string, ts: number, sessionId = 's1', role: Speaker = 'user'): StoredMessage {
  return { sessionId, role, content, ts }
}

describe('IdbStore', () => {
  it('写入后可读回，且按时间升序', async () => {
    const store = freshStore()
    await store.appendMessage(message('后', 200))
    await store.appendMessage(message('先', 100))

    const result = await store.listMessages('s1')

    expect(result.map((item) => item.content)).toEqual(['先', '后'])
  })

  it('按会话隔离消息', async () => {
    const store = freshStore()
    await store.appendMessage(message('属于 s1', 100, 's1'))
    await store.appendMessage(message('属于 s2', 200, 's2'))

    expect((await store.listMessages('s1')).map((item) => item.content)).toEqual(['属于 s1'])
  })

  it('清空指定会话时不影响其他会话', async () => {
    const store = freshStore()
    await store.appendMessage(message('a', 100, 's1'))
    await store.appendMessage(message('b', 200, 's2'))

    await store.clearSession('s1')

    expect(await store.listMessages('s1')).toEqual([])
    expect(await store.listMessages('s2')).toHaveLength(1)
  })

  it('保留消息的角色与时间戳', async () => {
    const store = freshStore()
    await store.appendMessage(message('在的', 300, 's1', 'assistant'))

    const [stored] = await store.listMessages('s1')

    expect(stored?.role).toBe('assistant')
    expect(stored?.ts).toBe(300)
  })
})
