import { DEFAULT_CHAT_CONFIG, normalizeChatConfig, type ChatConfig } from '../../core/llm/config'

const STORAGE_KEY = 'regret.chatConfig'

/**
 * 构建期 `.env` 提供的默认值。
 *
 * 仅在页面从未配置过时使用，保证 Web 与开发环境的既有行为逐字节不变。密钥类变量
 * 没有 `VITE_` 前缀、前端拿不到，因此只能留空：代理模式下由代理侧兜底，直连模式下
 * 需要用户在设置页自行填写。`VITE_CHAT_PROVIDER` 的合法值由 `normalizeChatConfig`
 * 兜住，写错（含 undefined）即回落到 `mock`。
 */
function envDefaults(): ChatConfig {
  return normalizeChatConfig({
    ...DEFAULT_CHAT_CONFIG,
    provider: import.meta.env.VITE_CHAT_PROVIDER,
    endpoint: import.meta.env.VITE_CHAT_API_ENDPOINT ?? '',
  })
}

/**
 * 读取连接配置。
 *
 * 无本地记录时回退到 `.env`；有记录则完全以页面配置为准。localStorage 属于不可信
 * 边界（规约第五节），读出的值一律经 `normalizeChatConfig` 规范化。
 */
export function loadChatConfig(): ChatConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return envDefaults()
    return normalizeChatConfig(JSON.parse(raw))
  } catch {
    return envDefaults()
  }
}

/** 保存连接配置；写入前同样规范化，避免把越界值落库。 */
export function saveChatConfig(config: ChatConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeChatConfig(config)))
}

/** 清除已保存的连接配置；清除后 `loadChatConfig` 会回到 `.env` 默认值。 */
export function clearChatConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}