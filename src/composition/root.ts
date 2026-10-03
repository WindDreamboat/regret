import { DeepSeekAdapter } from '../adapters/llm/DeepSeekAdapter'
import { MockChatProvider } from '../adapters/llm/MockChatProvider'
import { IdbStore } from '../adapters/storage/IdbStore'
import type { ChatProvider } from '../core/llm/ChatProvider'
import type { MemoryStore } from '../core/memory/MemoryStore'

export interface AppServices {
  chatProvider: ChatProvider
  memoryStore: MemoryStore
}

/**
 * 组装根：全项目唯一实例化具体实现的地方。
 *
 * 默认走 MockChatProvider，保证没有密钥也能跑通完整链路；把 VITE_CHAT_PROVIDER
 * 设为 deepseek 时改走代理（密钥由代理持有，前端拿不到）。
 * 浏览器无法得知代理是否配置了密钥，因此这里用显式的非敏感开关，而非自动探测。
 */
export function createServices(
  provider: string | undefined = import.meta.env.VITE_CHAT_PROVIDER,
): AppServices {
  return {
    // delayMs 必须大于 0，否则 Mock 会一次性吐出整句，演示路径上看不到流式效果
    chatProvider:
      provider === 'deepseek' ? new DeepSeekAdapter() : new MockChatProvider({ delayMs: 30 }),
    memoryStore: new IdbStore(),
  }
}
