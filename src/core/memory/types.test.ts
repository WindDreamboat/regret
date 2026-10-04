import { describe, expect, it } from 'vitest'
import { intimacyGainPerRound } from './types'

describe('intimacyGainPerRound', () => {
  it('「关系推进」旋钮 0-1 映射到每轮 1-3', () => {
    expect(intimacyGainPerRound(0)).toBe(1)
    expect(intimacyGainPerRound(0.5)).toBe(2)
    expect(intimacyGainPerRound(1)).toBe(3)
  })

  it('越界值先夹进 0-1（localStorage 是不可信边界）', () => {
    expect(intimacyGainPerRound(-1)).toBe(1)
    expect(intimacyGainPerRound(2)).toBe(3)
  })
})
