import type { Fact, FactOp, Relation, StoredMessage, Summary } from './types'

/**
 * 记忆存储。
 *
 * 同时承担对话消息、事实、关系状态与摘要的持久化；事实以 key 覆盖式更新。
 */
export interface MemoryStore {
  appendMessage(message: StoredMessage): Promise<void>
  /** 按时间升序返回会话内的全部消息 */
  listMessages(sessionId: string): Promise<StoredMessage[]>
  clearSession(sessionId: string): Promise<void>

  /** 返回会话内的全部事实（含 pending 与过期） */
  listFacts(sessionId: string): Promise<Fact[]>
  /** 应用一批事实操作，覆盖式更新；now 用于写入时间戳 */
  applyFactOps(sessionId: string, ops: FactOp[], now: number): Promise<void>
  /** 标记某条事实已被主动追问过，避免重复追问；事实不存在时静默返回 */
  markFactFollowedUp(sessionId: string, key: string, now: number): Promise<void>

  /** 返回关系状态，未初始化时返回默认值 */
  getRelation(sessionId: string): Promise<Relation>
  /** 合并补丁到关系状态 */
  updateRelation(sessionId: string, patch: Partial<Relation>): Promise<void>

  /** 按时间升序返回会话内的全部摘要 */
  listSummaries(sessionId: string): Promise<Summary[]>
  appendSummary(sessionId: string, summary: Summary): Promise<void>
}
