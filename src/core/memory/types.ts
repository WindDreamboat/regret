import type { Speaker } from '../llm/protocol'

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
