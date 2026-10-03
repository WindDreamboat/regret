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

export interface AskOptions {
  /** 两次调用之间的最小间隔，缓解网关速率限制 */
  minIntervalMs?: number
  /** 失败重试次数（指数退避） */
  attempts?: number
}

let lastCallAt = 0

/**
 * 带节流与重试的完成调用。
 *
 * 网关常有速率限制，429 属于瞬时失败而非内容不合格；这里统一按指数退避重试，
 * 避免把限流误判成评测不通过。
 */
export async function ask(
  provider: ChatProvider,
  messages: ChatMessage[],
  options: AskOptions = {},
): Promise<string> {
  const minIntervalMs = options.minIntervalMs ?? 300
  const attempts = options.attempts ?? 4
  let lastError: unknown

  for (let i = 0; i < attempts; i += 1) {
    const wait = lastCallAt + minIntervalMs - Date.now()
    if (wait > 0) await sleep(wait)
    lastCallAt = Date.now()

    try {
      return await complete(provider, messages)
    } catch (error) {
      lastError = error
      await sleep(500 * 2 ** i)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}