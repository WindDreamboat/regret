import type { StoredMessage, Summary } from './types'

/** 未摘要消息超过该条数时触发一次摘要 */
export const SUMMARY_TRIGGER_COUNT = 40

/** 每次摘要压缩的最老消息条数 */
export const SUMMARY_BATCH_COUNT = 20

/** 一次 level-1 摘要计划：把 id 落在 [coversFromId, coversToId] 的消息压成一条摘要 */
export interface SummaryPlan {
  level: 1
  coversFromId: number
  coversToId: number
}

/**
 * 决定是否需要对最老的未摘要消息做一次 level-1 摘要。
 *
 * 已被既有摘要覆盖（id ≤ 最大 coversToId）的消息不参与计数；
 * 未摘要消息超过阈值时取最老的一批，否则返回 null 表示暂不需要摘要。
 */
export function selectSummaryRange(
  messages: readonly StoredMessage[],
  summaries: readonly Summary[],
): SummaryPlan | null {
  const coveredToId = summaries.reduce((max, summary) => Math.max(max, summary.coversToId), 0)
  const pending = messages.filter(
    (message): message is StoredMessage & { id: number } =>
      message.id !== undefined && message.id > coveredToId,
  )

  if (pending.length <= SUMMARY_TRIGGER_COUNT) return null

  const batch = pending.slice(0, SUMMARY_BATCH_COUNT)
  const first = batch[0]
  const last = batch.at(-1)
  if (first === undefined || last === undefined) return null

  return { level: 1, coversFromId: first.id, coversToId: last.id }
}