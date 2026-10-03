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

describe('InMemoryStore 记忆方法', () => {
  it('应用事实操作后可读回，且同 key 覆盖', async () => {
    const store = new InMemoryStore()
    await store.applyFactOps(
      's1',
      [{ op: 'upsert', key: 'user.drink', value: '拿铁', category: 'preference', confidence: 0.9 }],
      100,
    )
    await store.applyFactOps(
      's1',
      [{ op: 'upsert', key: 'user.drink', value: '美式', category: 'preference', confidence: 0.9 }],
      200,
    )

    const facts = await store.listFacts('s1')

    expect(facts).toHaveLength(1)
    expect(facts[0]?.value).toBe('美式')
    expect(facts[0]?.firstSeenAt).toBe(100)
    expect(facts[0]?.updatedAt).toBe(200)
  })

  it('按会话隔离事实', async () => {
    const store = new InMemoryStore()
    await store.applyFactOps(
      's1',
      [{ op: 'upsert', key: 'user.drink', value: '拿铁', category: 'preference', confidence: 0.9 }],
      100,
    )

    expect(await store.listFacts('s2')).toEqual([])
  })

  it('关系状态未初始化时返回默认值', async () => {
    const store = new InMemoryStore()
    const relation = await store.getRelation('s1')

    expect(relation.sessionId).toBe('s1')
    expect(relation.intimacy).toBe(0)
  })

  it('更新关系状态时合并补丁并保留其余字段', async () => {
    const store = new InMemoryStore()
    await store.updateRelation('s1', { intimacy: 30, stage: '熟悉' })

    const relation = await store.getRelation('s1')

    expect(relation.intimacy).toBe(30)
    expect(relation.stage).toBe('熟悉')
    expect(relation.sessionId).toBe('s1')
  })

  it('摘要按时间升序返回，且按会话隔离', async () => {
    const store = new InMemoryStore()
    await store.appendSummary('s1', {
      sessionId: 's1',
      level: 1,
      coversFromId: 1,
      coversToId: 20,
      content: '后',
      ts: 200,
    })
    await store.appendSummary('s1', {
      sessionId: 's1',
      level: 1,
      coversFromId: 21,
      coversToId: 40,
      content: '先',
      ts: 100,
    })

    expect((await store.listSummaries('s1')).map((item) => item.content)).toEqual(['先', '后'])
    expect(await store.listSummaries('s2')).toEqual([])
  })
})
