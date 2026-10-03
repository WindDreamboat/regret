import { describe, expect, it } from 'vitest'
import { DEFAULT_STRATEGY } from '../strategy/types'
import { buildMemoryExport, MEMORY_EXPORT_FORMAT, MEMORY_EXPORT_VERSION } from './export'
import type { Fact, Relation, StoredMessage, Summary } from './types'

const NOW = 1_700_000_000_000

const messages: StoredMessage[] = [
  { id: 1, sessionId: 'default', role: 'user', content: '在吗', ts: 1 },
  { id: 2, sessionId: 'default', role: 'assistant', content: '在的', ts: 2 },
]

const facts: Fact[] = [
  {
    sessionId: 'default',
    key: 'user.drink',
    value: '美式',
    category: 'preference',
    confidence: 0.9,
    sourceMsgIds: [1],
    firstSeenAt: 1,
    updatedAt: 2,
    status: 'confirmed',
  },
]

const relation: Relation = {
  sessionId: 'default',
  stage: '熟悉',
  intimacy: 30,
  mood: '温和',
  energy: 0.6,
  addressForm: '阿泽',
  sharedExperiences: ['看了一场电影'],
  boundaries: ['不提家人'],
  updatedAt: 2,
}

const summaries: Summary[] = [
  { id: 1, sessionId: 'default', level: 1, coversFromId: 1, coversToId: 20, content: '摘要', ts: 3 },
]

function input() {
  return {
    sessionId: 'default',
    persona: { name: '小满', userAddress: '阿泽', personality: '温和', background: '书店' },
    strategy: { ...DEFAULT_STRATEGY, humor: 0.8 },
    messages,
    facts,
    relation,
    summaries,
  }
}

describe('buildMemoryExport', () => {
  it('带上格式标识、版本与导出时间', () => {
    const result = buildMemoryExport(input(), NOW)

    expect(result.format).toBe(MEMORY_EXPORT_FORMAT)
    expect(result.version).toBe(MEMORY_EXPORT_VERSION)
    expect(result.exportedAt).toBe(NOW)
    expect(result.sessionId).toBe('default')
  })

  it('包含全部五类内容：对话、事实、关系、摘要、人设与旋钮', () => {
    const result = buildMemoryExport(input(), NOW)

    expect(result.messages).toHaveLength(2)
    expect(result.facts).toHaveLength(1)
    expect(result.summaries).toHaveLength(1)
    expect(result.relation.intimacy).toBe(30)
    expect(result.persona.name).toBe('小满')
    expect(result.strategy.humor).toBe(0.8)
  })

  it('输出为深拷贝，改入参不影响已生成的备份', () => {
    const source = input()
    const result = buildMemoryExport(source, NOW)

    source.messages[0]!.content = '被篡改'
    source.facts[0]!.sourceMsgIds.push(99)
    source.relation.sharedExperiences.push('被追加')

    expect(result.messages[0]?.content).toBe('在吗')
    expect(result.facts[0]?.sourceMsgIds).toEqual([1])
    expect(result.relation.sharedExperiences).toEqual(['看了一场电影'])
  })

  it('序列化后不残留 undefined 字段', () => {
    const result = buildMemoryExport({ ...input(), messages: [{ ...messages[0]!, id: undefined }] }, NOW)
    const json = JSON.stringify(result)

    expect(json).not.toContain('undefined')
    expect(JSON.parse(json)).toMatchObject({ format: MEMORY_EXPORT_FORMAT })
  })

  it('空数据也能导出成合法备份', () => {
    const result = buildMemoryExport(
      { ...input(), messages: [], facts: [], summaries: [] },
      NOW,
    )

    expect(result.messages).toEqual([])
    expect(result.facts).toEqual([])
    expect(JSON.parse(JSON.stringify(result))).toBeTruthy()
  })
})
