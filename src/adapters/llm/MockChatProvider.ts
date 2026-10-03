import { PENDING_FOLLOW_UP_MARKER, STRATEGY_SECTION_MARKER } from '../../core/memory/compose'
import { EXTRACTION_MARKER } from '../../core/memory/extract'
import { FOLLOW_UP_MARKER, PROACTIVE_MARKER } from '../../core/memory/followUp'
import type { ChatProvider } from '../../core/llm/ChatProvider'
import type { ChatMessage, StreamEvent } from '../../core/llm/protocol'

export interface MockChatProviderOptions {
  /** 字符之间的间隔毫秒数，用于观察流式效果 */
  delayMs?: number
}

/** 开发与测试用的假 provider：把最后一条用户消息逐字回显，并附带一行状态块。 */
export class MockChatProvider implements ChatProvider {
  private readonly delayMs: number

  constructor(options: MockChatProviderOptions = {}) {
    this.delayMs = options.delayMs ?? 0
  }

  async *stream(messages: ChatMessage[]): AsyncIterable<StreamEvent> {
    for (const char of this.replyTo(messages)) {
      if (this.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delayMs))
      }
      yield { type: 'delta', text: char }
    }

    yield { type: 'done' }
  }

  private replyTo(messages: ChatMessage[]): string {
    const contains = (marker: string) => messages.some((message) => message.content.includes(marker))

    // 抽取请求走同一条流式通道，返回空 ops 以免污染主对话链路
    if (contains(EXTRACTION_MARKER)) return '{"ops":[]}'

    // 打开 App 时的主动开场：追问事件优先于普通欢迎语
    if (contains(FOLLOW_UP_MARKER)) {
      return '你之前提到的那件事，后来怎么样了？<state>{"mood":"关切","energy":0.6,"affection_delta":1}</state>'
    }
    if (contains(PROACTIVE_MARKER)) {
      return '嗨，我在的，今天想聊点什么？<state>{"mood":"期待","energy":0.7,"affection_delta":0}</state>'
    }

    const lastUser = [...messages].reverse().find((message) => message.role === 'user')
    const reply = lastUser ? `我听到你说：${lastUser.content}` : '我在。'
    // 哑探测：只判断标记是否存在，不解析渲染文本（否则测的是替身而非接线）
    const prefix = [
      contains(PENDING_FOLLOW_UP_MARKER) ? '（接着上次的话题）' : '',
      contains(STRATEGY_SECTION_MARKER) ? '（按你的设定）' : '',
    ].join('')
    return `${prefix}${reply}<state>{"mood":"温和","energy":0.7,"affection_delta":1}</state>`
  }
}