import type { Speaker } from '../llm/protocol'

/** V1 为单会话：固定会话标识。导出与清除需要与 useChat 共享同一常量。 */
export const DEFAULT_SESSION_ID = 'default'

/** 持久化的对话消息 */
export interface StoredMessage {
  /** IndexedDB 自增主键，写入时不需要提供 */
  id?: number
  sessionId: string
  role: Speaker
  content: string
  /** 毫秒时间戳 */
  ts: number
}

/** 事实的置信状态：低置信度先记 pending，二次出现才升为 confirmed */
export type FactStatus = 'confirmed' | 'pending'

/** 一条关于用户的事实，以 key 覆盖式更新 */
export interface Fact {
  sessionId: string
  key: string
  value: string
  category: string
  confidence: number
  /** 事件类事实的失效时间戳；过期后不进 prompt */
  validUntil?: number
  /** 事件类事实的发生时间戳；用于判断事件是否已发生、可否主动追问 */
  eventAt?: number
  /** 已被主动追问过的时间戳；存在即不再重复追问同一事件 */
  followedUpAt?: number
  sourceMsgIds: number[]
  firstSeenAt: number
  updatedAt: number
  status: FactStatus
}

/** 抽取协议中的一条操作 */
export type FactOp =
  | {
      op: 'upsert'
      key: string
      value: string
      category: string
      confidence: number
      validUntil?: number
      eventAt?: number
    }
  | { op: 'delete'; key: string }

/** 关系状态，每个会话一条 */
export interface Relation {
  sessionId: string
  stage: string
  /** 亲密度，0-100 */
  intimacy: number
  /** 伴侣当前心情的自然语言描述，未产生状态块时为空串 */
  mood: string
  /** 伴侣当前精力，0-1 */
  energy: number
  addressForm: string
  sharedExperiences: string[]
  boundaries: string[]
  updatedAt: number
}

/** 分层摘要 */
export interface Summary {
  id?: number
  sessionId: string
  level: 1 | 2
  coversFromId: number
  coversToId: number
  content: string
  ts: number
}

/** 生成某会话的默认关系状态 */
export function createDefaultRelation(sessionId: string, now: number): Relation {
  return {
    sessionId,
    stage: '初识',
    intimacy: 0,
    mood: '',
    energy: 0.6,
    addressForm: '',
    sharedExperiences: [],
    boundaries: [],
    updatedAt: now,
  }
}
