/** 对话服务提供方：`mock` 为本地回声（默认），`deepseek` 走自建代理。 */
export type ChatProviderKind = 'mock' | 'deepseek'

/**
 * 连接配置。
 *
 * 全部可在设置页填写，因此这里处于不可信边界（localStorage）。字符串为空表示
 * 「交给默认」：代理地址留空用相对路径 `/api/chat`，Key / 网关地址 / 模型名留空
 * 则由代理侧的环境变量提供。
 */
export interface ChatConfig {
  provider: ChatProviderKind
  /** 代理地址；空串表示用默认相对路径 */
  endpoint: string
  /** API Key；空串表示由代理侧环境变量提供 */
  apiKey: string
  /** 上游网关地址；空串表示由代理侧环境变量提供 */
  baseUrl: string
  /** 模型名；空串表示由代理侧环境变量提供 */
  model: string
}

export const DEFAULT_CHAT_CONFIG: ChatConfig = {
  provider: 'mock',
  endpoint: '',
  apiKey: '',
  baseUrl: '',
  model: '',
}

/**
 * 客户端把连接配置透传给代理时使用的请求头。
 *
 * 前后端共用同一份常量，避免字面量在两处漂移。空值不发送：代理据此回退到自己的
 * 环境变量，因此「不改代理」与「页面直填」两种用法同时成立。
 */
export const CHAT_CONFIG_HEADERS = {
  apiKey: 'Authorization',
  baseUrl: 'X-Chat-Base-Url',
  model: 'X-Chat-Model',
} as const

/** 单个文本字段的长度上限，避免异常长的值进入请求头或地址。 */
const MAX_FIELD_LENGTH = 2048

/**
 * 规范化连接配置。
 *
 * localStorage 属于不可信边界（规约第五节）：非对象整体退回默认；`provider` 非枚举值
 * 退回 `mock`；文本字段去空白并截断；代理地址与网关地址会被直接用于 fetch，只接受
 * `http(s)://` 或以 `/` 开头的形式，其余归空。纯函数，不修改入参，始终返回新对象。
 */
export function normalizeChatConfig(input: unknown): ChatConfig {
  if (typeof input !== 'object' || input === null) return { ...DEFAULT_CHAT_CONFIG }
  const record = input as Record<string, unknown>

  return {
    provider: record['provider'] === 'deepseek' ? 'deepseek' : 'mock',
    endpoint: readUrlLike(record['endpoint']),
    apiKey: readText(record['apiKey']),
    baseUrl: readUrlLike(record['baseUrl']),
    model: readText(record['model']),
  }
}

function readText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, MAX_FIELD_LENGTH)
}

/** 空串原样保留（表示交给默认）；只接受绝对 http(s) 地址或以 / 开头的相对路径。 */
function readUrlLike(value: unknown): string {
  const text = readText(value)
  if (text === '' || text.startsWith('/')) return text
  if (text.startsWith('https://') || text.startsWith('http://')) return text
  return ''
}