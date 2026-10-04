/**
 * 对话服务提供方。
 *
 * - `mock`：本地回声，默认值，没有密钥也能跑通完整链路
 * - `deepseek`：走自建代理（协议由 `server/handler.ts` 定义，连接配置随请求头透传）
 * - `direct`：App 直接调厂商接口，不需要部署代理，但厂商必须允许跨源访问
 */
export type ChatProviderKind = 'mock' | 'deepseek' | 'direct'

const PROVIDER_KINDS: readonly ChatProviderKind[] = ['mock', 'deepseek', 'direct']

/**
 * 直连模式的兜底模型名。
 *
 * 直连时模型名由客户端写进请求体，留空会让厂商按自己的默认模型处理、结果不可预期，
 * 因此给一个确定的兜底值。
 */
export const DEFAULT_DIRECT_MODEL = 'deepseek-chat'

/**
 * 连接配置。
 *
 * 全部可在设置页填写，因此这里处于不可信边界（localStorage）。字符串为空表示
 * 「交给默认」，含义随提供方而变：
 *
 * - `deepseek`（代理）：接口地址留空用相对路径 `/api/chat`，Key / 网关地址 / 模型名
 *   留空则由代理侧的环境变量提供
 * - `direct`（直连）：接口地址与 Key 都必须填，模型名留空用 `DEFAULT_DIRECT_MODEL`
 */
export interface ChatConfig {
  provider: ChatProviderKind
  /** 接口地址：代理模式下是自建代理，直连模式下是厂商的完整接口地址 */
  endpoint: string
  /** API Key；代理模式下空串表示由代理侧环境变量提供，直连模式下必填 */
  apiKey: string
  /** 上游网关地址（仅代理模式使用）；空串表示由代理侧环境变量提供 */
  baseUrl: string
  /** 模型名；空串在代理模式下由代理侧提供，直连模式下用 DEFAULT_DIRECT_MODEL */
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
 * 把直连模式填的地址补成**完整的对话接口地址**。
 *
 * 为什么需要：设置里那个框，用户很容易把"网关地址"当成"接口地址"填进来——真机实测有人填
 * `https://gateway.example.com/api/v1`，厂商回 307 把它跳到 `/v1/`，原生请求不跟随
 * 重定向，于是界面只报一句「接口返回 307」。
 *
 * 补路径的规则与代理侧完全一致（见 `server/handler.ts`）：已经是 `chat/completions` 就原样用，
 * 以 `/v1` 结尾就补 `/chat/completions`，其余补 `/v1/chat/completions`。纯函数，不改入参。
 */
export function resolveDirectEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '')
  if (trimmed === '') return ''

  if (trimmed.endsWith('/chat/completions')) return trimmed
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`
  return `${trimmed}/v1/chat/completions`
}

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
    provider: readProvider(record['provider']),
    endpoint: readUrlLike(record['endpoint']),
    apiKey: readText(record['apiKey']),
    baseUrl: readUrlLike(record['baseUrl']),
    model: readText(record['model']),
  }
}

/** 枚举外的值一律退回 `mock`：认不出的提供方宁可回声，也不静默发真实请求。 */
function readProvider(value: unknown): ChatProviderKind {
  return typeof value === 'string' && PROVIDER_KINDS.includes(value as ChatProviderKind)
    ? (value as ChatProviderKind)
    : 'mock'
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