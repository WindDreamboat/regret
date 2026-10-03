import type { Persona } from '../persona/types'
import type { StrategyProfile } from '../strategy/types'
import type { Fact, Relation, StoredMessage, Summary } from './types'

/** 导出格式版本；结构变更时递增，便于将来识别旧备份 */
export const MEMORY_EXPORT_VERSION = 1

/** 导出文件的格式标识 */
export const MEMORY_EXPORT_FORMAT = 'regret.memory-export'

/** 组装导出所需的数据快照 */
export interface MemoryExportInput {
  sessionId: string
  persona: Persona
  strategy: StrategyProfile
  messages: readonly StoredMessage[]
  facts: readonly Fact[]
  relation: Relation
  summaries: readonly Summary[]
}

/**
 * 可导出的记忆备份。
 *
 * 人设与旋钮一并带上——导出的意义是「她是谁」也在里面，而不只是对话。
 */
export interface MemoryExport {
  format: string
  version: number
  /** 导出时刻，毫秒时间戳 */
  exportedAt: number
  sessionId: string
  persona: Persona
  strategy: StrategyProfile
  messages: StoredMessage[]
  facts: Fact[]
  relation: Relation
  summaries: Summary[]
}

/**
 * 组装记忆备份（纯函数）。
 *
 * 只做序列化，不触碰存储与浏览器 API；`now` 由调用方传入以便测试。
 * 输出为深拷贝，调用方后续修改入参不会影响已生成的备份。
 */
export function buildMemoryExport(input: MemoryExportInput, now: number): MemoryExport {
  return {
    format: MEMORY_EXPORT_FORMAT,
    version: MEMORY_EXPORT_VERSION,
    exportedAt: now,
    sessionId: input.sessionId,
    persona: { ...input.persona },
    strategy: { ...input.strategy },
    messages: input.messages.map((message) => ({ ...message })),
    facts: input.facts.map((fact) => ({ ...fact, sourceMsgIds: [...fact.sourceMsgIds] })),
    relation: {
      ...input.relation,
      sharedExperiences: [...input.relation.sharedExperiences],
      boundaries: [...input.relation.boundaries],
    },
    summaries: input.summaries.map((summary) => ({ ...summary })),
  }
}
