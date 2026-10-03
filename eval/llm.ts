import { DeepSeekAdapter } from '../src/adapters/llm/DeepSeekAdapter'
import type { ChatProvider } from '../src/core/llm/ChatProvider'
import type { ChatMessage } from '../src/core/llm/protocol'
import { createChatHandler } from '../server/handler'

/**
 * 评测脚本的组装点（与 composition/root.ts 并列，仅用于开发工具）。
 *
 * 复用 /api/chat 代理 handler：把 DeepSeekAdapter 的 fetch 接到 handler 上，
 * 于是密钥读取、模型名与 SSE 解析都走线上同一套代码，评测与产品行为一致。
 */
export function createEvalProvider(): ChatProvider {
  const handle = createChatHandler()
  return new DeepSeekAdapter({
    endpoint: 'http://eval.local/api/chat',
    fetchImpl: (input, init) => handle(new Request(input, init)),
  })
}

/** 消费流式回复并拼出完整文本；出错时抛出，由调用方决定如何降级。 */
export async function complete(provider: ChatProvider, messages: ChatMessage[]): Promise<string> {
  let text = ''
  for await (const event of provider.stream(messages)) {
    if (event.type === 'delta') text += event.text
    else if (event.type === 'error') throw new Error(event.message)
  }
  return text
}