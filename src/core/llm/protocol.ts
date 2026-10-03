/** 对话中发言的一方 */
export type Speaker = 'user' | 'assistant'

/** 消息角色，system 为系统提示，不参与持久化 */
export type Role = Speaker | 'system'

/** 发给模型的消息 */
export interface ChatMessage {
  role: Role
  content: string
}

/** 流式生成过程中产生的事件 */
export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
