import type { ChatMessage, StreamEvent } from './protocol'

/** 对话模型提供方。适配器实现该接口，core 只依赖它。 */
export interface ChatProvider {
  /** 流式生成回复，调用方以 for await 消费事件流。 */
  stream(messages: ChatMessage[]): AsyncIterable<StreamEvent>
}
