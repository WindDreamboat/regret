import type { StoredMessage } from './types'

/**
 * 记忆存储。
 *
 * 本迭代只承担对话消息的持久化；事实、关系状态、摘要等方法在迭代 2 扩充。
 */
export interface MemoryStore {
  appendMessage(message: StoredMessage): Promise<void>
  /** 按时间升序返回会话内的全部消息 */
  listMessages(sessionId: string): Promise<StoredMessage[]>
  clearSession(sessionId: string): Promise<void>
}
