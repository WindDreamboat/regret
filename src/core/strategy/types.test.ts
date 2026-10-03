import { describe, expect, it } from 'vitest'
import { CHALLENGE_MIN, DEFAULT_STRATEGY, normalizeStrategy } from './types'

/** 一个全部偏离默认的合法档案，用于验证"原样返回" */
const custom = {
  proactivity: 0.8,
  empathyDensity: 0.2,
  humor: 0.9,
  pace: 0.1,
  verbosity: 0.35,
  challenge: 0.6,
}

describe('normalizeStrategy', () => {
  it('合法输入原样返回', () => {
    expect(normalizeStrategy(custom)).toEqual(custom)
  })

  it('顶层不是对象时退回默认', () => {
    expect(normalizeStrategy(null)).toEqual(DEFAULT_STRATEGY)
    expect(normalizeStrategy('nope')).toEqual(DEFAULT_STRATEGY)
    expect(normalizeStrategy(undefined)).toEqual(DEFAULT_STRATEGY)
    expect(normalizeStrategy([1, 2, 3])).toEqual(DEFAULT_STRATEGY)
  })

  it('缺字段时该字段用默认值', () => {
    const result = normalizeStrategy({ humor: 0.9 })
    expect(result.humor).toBe(0.9)
    expect(result.proactivity).toBe(DEFAULT_STRATEGY.proactivity)
    expect(result.challenge).toBe(DEFAULT_STRATEGY.challenge)
  })

  it('字段类型非法时用默认值', () => {
    const result = normalizeStrategy({ humor: '0.9', pace: null, verbosity: true })
    expect(result.humor).toBe(DEFAULT_STRATEGY.humor)
    expect(result.pace).toBe(DEFAULT_STRATEGY.pace)
    expect(result.verbosity).toBe(DEFAULT_STRATEGY.verbosity)
  })

  it('NaN 与 Infinity 视为非法，用默认值', () => {
    const result = normalizeStrategy({ humor: Number.NaN, pace: Number.POSITIVE_INFINITY })
    expect(result.humor).toBe(DEFAULT_STRATEGY.humor)
    expect(result.pace).toBe(DEFAULT_STRATEGY.pace)
  })

  it('越界值夹紧到 0-1', () => {
    const result = normalizeStrategy({ humor: 5, pace: -3 })
    expect(result.humor).toBe(1)
    expect(result.pace).toBe(0)
  })

  it('challenge 不低于下限', () => {
    expect(normalizeStrategy({ challenge: 0 }).challenge).toBe(CHALLENGE_MIN)
    expect(normalizeStrategy({ challenge: 0.05 }).challenge).toBe(CHALLENGE_MIN)
    expect(normalizeStrategy({ challenge: 0.9 }).challenge).toBe(0.9)
  })

  it('下限常量为 0.15', () => {
    expect(CHALLENGE_MIN).toBe(0.15)
  })

  it('幂等：再次规范化结果不变', () => {
    const once = normalizeStrategy({ challenge: 0, humor: 9 })
    expect(normalizeStrategy(once)).toEqual(once)
  })

  it('不修改传入对象，且不返回 DEFAULT_STRATEGY 的同一引用', () => {
    const input = { ...custom }
    const result = normalizeStrategy(input)
    expect(input).toEqual(custom)
    expect(result).not.toBe(DEFAULT_STRATEGY)
    expect(normalizeStrategy({})).not.toBe(DEFAULT_STRATEGY)
  })

  it('默认档案全部落在合法区间内', () => {
    for (const value of Object.values(DEFAULT_STRATEGY)) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
    expect(DEFAULT_STRATEGY.challenge).toBeGreaterThanOrEqual(CHALLENGE_MIN)
  })
})
