import type { ChatProvider } from '../../core/llm/ChatProvider'
import type { ChatMessage, StreamEvent } from '../../core/llm/protocol'

export interface MockChatProviderOptions {
  /** 字符之间的间隔毫秒数，用于观察流式效果 */
  delayMs?: number
}

/** 开发与测试用的假 provider：把最后一条用户消息逐字回显。 */
export class MockChatProvider implements ChatProvider {
  private readonly delayMs: number

  constructor(options: MockChatProviderOptions = {}) {
    this.delayMs = options.delayMs ?? 0
  }

  async *stream(messages: ChatMessage[]): AsyncIterable<StreamEvent> {
    const lastUser = [...messages].reverse().find((message) => message.role === 'user')
    const reply = lastUser ? `我听到你说：${lastUser.content}` : '我在。'

    for (const char of reply) {
      if (this.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delayMs))
      }
      yield { type: 'delta', text: char }
    }

    yield { type: 'done' }
  }
}
