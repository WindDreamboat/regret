import { describe, expect, it } from 'vitest'
import { nextRevealCount } from './pacing'

const base = { shown: 0, total: 10, elapsedMs: 0, generating: true }

describe('nextRevealCount', () => {
  it('上游结束时立即补齐，界面不落后于真实状态', () => {
    expect(nextRevealCount({ ...base, shown: 3, generating: false })).toBe(10)
  })

  it('已经显示完就不再推进', () => {
    expect(nextRevealCount({ ...base, shown: 10, elapsedMs: 1000 })).toBe(10)
  })

  it('时间不够一格时原地等待，避免"抽搐式"跳字', () => {
    expect(nextRevealCount({ ...base, elapsedMs: 8 })).toBe(0)
  })

  it('按 20 ms/字推进', () => {
    expect(nextRevealCount({ ...base, elapsedMs: 60 })).toBe(3)
  })

  it('积压越多铺得越快：短回复按基础速度，长回复加速', () => {
    const short = nextRevealCount({ shown: 0, total: 40, elapsedMs: 60, generating: true })
    const medium = nextRevealCount({ shown: 0, total: 100, elapsedMs: 60, generating: true })
    const long = nextRevealCount({ shown: 0, total: 300, elapsedMs: 60, generating: true })

    expect(short).toBe(3)
    expect(medium).toBe(6)
    expect(long).toBe(9)
  })

  it('不会超过已知总字数', () => {
    expect(nextRevealCount({ shown: 8, total: 10, elapsedMs: 5000, generating: true })).toBe(10)
  })

  it('一次推进的量随 elapsed 增大而增大，且单调不减', () => {
    const first = nextRevealCount({ ...base, elapsedMs: 40 })
    const second = nextRevealCount({ ...base, elapsedMs: 400 })
    expect(second).toBeGreaterThan(first)
  })
})
