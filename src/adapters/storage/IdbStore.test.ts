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

describe('IdbStore 记忆方法', () => {
  it('应用事实操作后可读回，且同 key 覆盖', async () => {
    const store = freshStore()
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
    const store = freshStore()
    await store.applyFactOps(
      's1',
      [{ op: 'upsert', key: 'user.drink', value: '拿铁', category: 'preference', confidence: 0.9 }],
      100,
    )

    expect(await store.listFacts('s2')).toEqual([])
  })

  it('delete 操作移除事实', async () => {
    const store = freshStore()
    await store.applyFactOps(
      's1',
      [{ op: 'upsert', key: 'user.drink', value: '拿铁', category: 'preference', confidence: 0.9 }],
      100,
    )
    await store.applyFactOps('s1', [{ op: 'delete', key: 'user.drink' }], 200)

    expect(await store.listFacts('s1')).toEqual([])
  })

  it('关系状态未初始化时返回默认值，更新后合并补丁', async () => {
    const store = freshStore()
    expect((await store.getRelation('s1')).intimacy).toBe(0)

    await store.updateRelation('s1', { intimacy: 30, stage: '熟悉' })

    const relation = await store.getRelation('s1')
    expect(relation.intimacy).toBe(30)
    expect(relation.stage).toBe('熟悉')
    expect(relation.sessionId).toBe('s1')
  })

  it('摘要按时间升序返回，且按会话隔离', async () => {
    const store = freshStore()
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

  it('标记事实已追问，只改 followedUpAt 并保留其余字段', async () => {
    const store = freshStore()
    await store.applyFactOps(
      's1',
      [{ op: 'upsert', key: 'user.interview', value: '面试', category: 'event', confidence: 0.9, eventAt: 3000 }],
      100,
    )

    await store.markFactFollowedUp('s1', 'user.interview', 200)

    const [fact] = await store.listFacts('s1')
    expect(fact?.followedUpAt).toBe(200)
    expect(fact?.value).toBe('面试')
    expect(fact?.eventAt).toBe(3000)
  })

  it('标记不存在的事实时不抛错', async () => {
    const store = freshStore()
    await expect(store.markFactFollowedUp('s1', 'user.missing', 200)).resolves.toBeUndefined()
  })

  it('清空会话会一并清掉四类数据，且不碰其他会话', async () => {
    const store = freshStore()
    for (const sessionId of ['s1', 's2']) {
      await store.appendMessage(message(`属于 ${sessionId}`, 100, sessionId))
      await store.applyFactOps(
        sessionId,
        [{ op: 'upsert', key: 'user.drink', value: '拿铁', category: 'preference', confidence: 0.9 }],
        100,
      )
      await store.updateRelation(sessionId, { intimacy: 30, stage: '熟悉' })
      await store.appendSummary(sessionId, {
        sessionId,
        level: 1,
        coversFromId: 1,
        coversToId: 20,
        content: `${sessionId} 的摘要`,
        ts: 100,
      })
    }

    await store.clearSession('s1')

    expect(await store.listMessages('s1')).toEqual([])
    expect(await store.listFacts('s1')).toEqual([])
    expect(await store.listSummaries('s1')).toEqual([])
    expect((await store.getRelation('s1')).intimacy).toBe(0)

    expect(await store.listMessages('s2')).toHaveLength(1)
    expect(await store.listFacts('s2')).toHaveLength(1)
    expect(await store.listSummaries('s2')).toHaveLength(1)
    expect((await store.getRelation('s2')).intimacy).toBe(30)
  })
})
