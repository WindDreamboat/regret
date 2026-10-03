import { describe, expect, it } from 'vitest'
import type { Fact } from './types'
import { FOLLOW_UP_WINDOW_MS, selectFollowUp } from './followUp'

const NOW = 10_000_000

function fact(overrides: Partial<Fact> = {}): Fact {
  return {
    sessionId: 's1',
    key: 'user.interview',
    value: '面试',
    category: 'event',
    confidence: 0.9,
    eventAt: NOW - 1000,
    sourceMsgIds: [],
    firstSeenAt: 0,
    updatedAt: 0,
    status: 'confirmed',
    ...overrides,
  }
}

describe('selectFollowUp', () => {
  it('没有事实时返回 null', () => {
    expect(selectFollowUp([], NOW)).toBeNull()
  })

  it('选出已发生且未追问过的事件', () => {
    expect(selectFollowUp([fact()], NOW)?.key).toBe('user.interview')
  })

  it('跳过 pending 事实', () => {
    expect(selectFollowUp([fact({ status: 'pending' })], NOW)).toBeNull()
  })

  it('跳过没有 eventAt 的事实', () => {
    expect(selectFollowUp([fact({ eventAt: undefined })], NOW)).toBeNull()
  })

  it('跳过尚未发生的事件', () => {
    expect(selectFollowUp([fact({ eventAt: NOW + 1000 })], NOW)).toBeNull()
  })

  it('跳过已经追问过的事件', () => {
    expect(selectFollowUp([fact({ followedUpAt: NOW - 500 })], NOW)).toBeNull()
  })

  it('跳过超出追问窗口的旧事件', () => {
    expect(selectFollowUp([fact({ eventAt: NOW - FOLLOW_UP_WINDOW_MS - 1 })], NOW)).toBeNull()
  })

  it('恰好落在追问窗口边界内的事件仍会被选出', () => {
    expect(selectFollowUp([fact({ eventAt: NOW - FOLLOW_UP_WINDOW_MS })], NOW)).not.toBeNull()
  })

  it('多个候选时取事件时间最近的一条', () => {
    const older = fact({ key: 'user.old', eventAt: NOW - 5000 })
    const newer = fact({ key: 'user.new', eventAt: NOW - 1000 })
    expect(selectFollowUp([older, newer], NOW)?.key).toBe('user.new')
  })

  it('不修改传入的事实数组', () => {
    const facts = [fact()]
    selectFollowUp(facts, NOW)
    expect(facts).toHaveLength(1)
  })
})