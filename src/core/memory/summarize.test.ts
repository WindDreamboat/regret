import { describe, expect, it } from 'vitest'
import { selectSummaryRange } from './summarize'
import type { StoredMessage, Summary } from './types'

function message(id: number): StoredMessage {
  return {
    id,
    sessionId: 'default',
    role: id % 2 === 1 ? 'user' : 'assistant',
    content: `第 ${id} 条`,
    ts: id,
  }
}

/** 生成 id 为 from..to 的连续消息 */
function range(from: number, to: number): StoredMessage[] {
  return Array.from({ length: to - from + 1 }, (_, index) => message(from + index))
}

function summary(overrides: Partial<Summary> = {}): Summary {
  return {
    sessionId: 'default',
    level: 1,
    coversFromId: 1,
    coversToId: 20,
    content: '摘要',
    ts: 0,
    ...overrides,
  }
}

describe('selectSummaryRange', () => {
  it('未摘要消息不超过阈值时返回 null', () => {
    expect(selectSummaryRange(range(1, 40), [])).toBeNull()
  })

  it('未摘要消息超过阈值时，取最老 20 条生成 level-1 计划', () => {
    expect(selectSummaryRange(range(1, 41), [])).toEqual({
      level: 1,
      coversFromId: 1,
      coversToId: 20,
    })
  })

  it('已被摘要覆盖的消息不参与计数', () => {
    const summaries = [summary({ coversFromId: 1, coversToId: 20 })]
    // 剩余 21 条，未超过阈值
    expect(selectSummaryRange(range(1, 41), summaries)).toBeNull()
  })

  it('覆盖后再次超过阈值时，从覆盖点之后取最老 20 条', () => {
    const summaries = [summary({ coversFromId: 1, coversToId: 20 })]
    // 剩余 21..65 共 45 条，超过阈值
    expect(selectSummaryRange(range(1, 65), summaries)).toEqual({
      level: 1,
      coversFromId: 21,
      coversToId: 40,
    })
  })

  it('多条摘要时以最大的 coversToId 作为覆盖点', () => {
    const summaries = [
      summary({ coversFromId: 1, coversToId: 20 }),
      summary({ coversFromId: 21, coversToId: 40 }),
    ]
    // 剩余 41..65 共 25 条，未超过阈值
    expect(selectSummaryRange(range(1, 65), summaries)).toBeNull()
  })

  it('缺少 id 的消息不计入待摘要范围', () => {
    const messages: StoredMessage[] = [
      ...range(1, 45),
      { sessionId: 'default', role: 'user', content: '尚未落库', ts: 0 },
    ]
    // 45 条带 id 的消息超过阈值，取其中最老 20 条
    expect(selectSummaryRange(messages, [])).toEqual({
      level: 1,
      coversFromId: 1,
      coversToId: 20,
    })
  })

  it('不修改传入的消息数组', () => {
    const messages = range(1, 41)
    selectSummaryRange(messages, [])
    expect(messages).toHaveLength(41)
  })
})