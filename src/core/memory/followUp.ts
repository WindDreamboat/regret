import type { Fact } from './types'

/** 距事件发生超过该时长（7 天）不再主动追问，避免翻出过久的旧事 */
export const FOLLOW_UP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 选出值得主动追问的事件事实。
 *
 * 仅考虑 confirmed、带 eventAt、事件已发生、尚未追问过、且落在追问窗口内的事实；
 * 多个候选时取事件时间最近的一条。返回 null 表示当前无需追问。
 */
export function selectFollowUp(facts: readonly Fact[], now: number): Fact | null {
  let best: Fact | null = null
  let bestEventAt = Number.NEGATIVE_INFINITY

  for (const fact of facts) {
    const eventAt = fact.eventAt
    if (fact.status !== 'confirmed') continue
    if (eventAt === undefined) continue
    if (fact.followedUpAt !== undefined) continue
    if (eventAt > now) continue
    if (now - eventAt > FOLLOW_UP_WINDOW_MS) continue
    if (eventAt > bestEventAt) {
      best = fact
      bestEventAt = eventAt
    }
  }

  return best
}