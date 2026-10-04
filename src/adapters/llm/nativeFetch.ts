import { Capacitor, CapacitorHttp } from '@capacitor/core'
import type { FetchLike } from './DeepSeekAdapter'

/** 原生请求的连接 / 读取超时；上游网关实测偶尔要 40 s 以上才回第一个字节 */
const CONNECT_TIMEOUT_MS = 30_000
const READ_TIMEOUT_MS = 180_000

/**
 * 系统级（原生）HTTP 传输：请求由宿主 App 发出，因此**不受浏览器同源策略约束**。
 *
 * 为什么需要它：打包后的 WebView 来源是 `https://localhost`，厂商接口若不回 CORS 头，
 * 浏览器侧的 fetch 会直接失败——实测 `https://gateway.example.com/api` 的预检
 * 返回 405 且响应里没有任何 `Access-Control-Allow-*`，这类网关**只能**由原生层直连。
 *
 * 代价：原生 HTTP 是**整包返回**，拿不到逐字流。厂商本身不逐字返回时没有损失（该网关
 * 就是一次性返回），流式的厂商则会退化成整段出现，因此它只作为浏览器 fetch 失败后的回退，
 * 而不是默认传输。
 *
 * 仅原生平台可用；Web 上返回 `undefined`，由调用方走普通 fetch。
 */
export function createNativeFetch(): FetchLike | undefined {
  if (!Capacitor.isNativePlatform()) return undefined

  return async (input, init) => {
    const response = await CapacitorHttp.request({
      url: input,
      method: init.method ?? 'GET',
      headers: readHeaders(init.headers),
      connectTimeout: CONNECT_TIMEOUT_MS,
      readTimeout: READ_TIMEOUT_MS,
      ...(typeof init.body === 'string' ? { data: init.body } : {}),
    })

    // 还原成 Response，让适配器继续用同一套 SSE 解析：整段文本里的 data: 行照样成立
    const headers = new Headers()
    for (const [name, value] of Object.entries(response.headers)) headers.set(name, value)

    return new Response(typeof response.data === 'string' ? response.data : JSON.stringify(response.data), {
      status: response.status,
      headers,
    })
  }
}

/** 适配器只传普通对象形式的头；其余形态（Headers 实例、数组）在这里统一成对象。 */
function readHeaders(headers: RequestInit['headers']): Record<string, string> {
  if (headers === undefined) return {}
  if (headers instanceof Headers) return Object.fromEntries(headers.entries())
  if (Array.isArray(headers)) return Object.fromEntries(headers)

  const result: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) result[name] = value
  }
  return result
}
