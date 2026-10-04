import { DeepSeekAdapter } from '../adapters/llm/DeepSeekAdapter'
import { MockChatProvider } from '../adapters/llm/MockChatProvider'
import { createNativeFetch } from '../adapters/llm/nativeFetch'
import { IdbStore } from '../adapters/storage/IdbStore'
import { DEFAULT_CHAT_CONFIG, type ChatConfig } from '../core/llm/config'
import type { ChatProvider } from '../core/llm/ChatProvider'
import type { MemoryStore } from '../core/memory/MemoryStore'

export interface AppServices {
  chatProvider: ChatProvider
  memoryStore: MemoryStore
}

/**
 * 组装根：全项目唯一实例化具体实现的地方。
 *
 * 连接配置由设置页维护（见 `features/settings/chatConfigStorage.ts`，未配置时回退到
 * 构建期 `.env`）。默认走 `MockChatProvider`，保证没有密钥也能跑通完整链路；选
 * `deepseek` 时走自建代理（连接配置随请求头透传，留空项由代理侧环境变量兜底），选
 * `direct` 时由 App 直连厂商接口（模型名与 Key 都得由设备提供）。
 */
export function createServices(config: ChatConfig = DEFAULT_CHAT_CONFIG): AppServices {
  return {
    chatProvider: createChatProvider(config),
    memoryStore: new IdbStore(),
  }
}

function createChatProvider(config: ChatConfig): ChatProvider {
  if (config.provider === 'mock') {
    // delayMs 必须大于 0，否则 Mock 会一次性吐出整句，演示路径上看不到流式效果
    return new MockChatProvider({ delayMs: 30 })
  }

  // 原生传输只在 App 里存在（Web 上为 undefined）：厂商不回 CORS 头时靠它兜底
  const nativeFetch = createNativeFetch()

  return new DeepSeekAdapter({
    mode: config.provider === 'direct' ? 'direct' : 'proxy',
    ...(nativeFetch !== undefined ? { nativeFetch } : {}),
    ...(config.endpoint !== '' ? { endpoint: config.endpoint } : {}),
    ...(config.apiKey !== '' ? { apiKey: config.apiKey } : {}),
    ...(config.baseUrl !== '' ? { baseUrl: config.baseUrl } : {}),
    ...(config.model !== '' ? { model: config.model } : {}),
  })
}
