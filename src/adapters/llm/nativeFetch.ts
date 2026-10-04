import { Capacitor, CapacitorHttp } from '@capacitor/core'
import type { FetchLike } from './DeepSeekAdapter'

/** 原生请求的连接 / 读取超时；上游网关实测偶尔要 40 s 以上才回第一个字节 */
const CONNECT_TIMEOUT_MS = 30_000
const READ_TIMEOUT_MS = 180_000

/** 最多跟随几次重定向，防止 A→B→A 这类循环把请求打成死循环 */
const MAX_REDIRECTS = 3

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
    let url = input

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await CapacitorHttp.request({
        url,
        method: init.method ?? 'GET',
        headers: readHeaders(init.headers),
        connectTimeout: CONNECT_TIMEOUT_MS,
        readTimeout: READ_TIMEOUT_MS,
        ...(typeof init.body === 'string' ? { data: init.body } : {}),
      })

      const location = readLocationHeader(response.headers)

      // 原生层不会自动跟随重定向（浏览器会），因此这里自己跟：最常见的是厂商把 http 跳成 https
      if (!isRedirect(response.status) || location === null) return toResponse(response)

      const next = resolveLocation(location, url)
      if (new URL(next).host !== new URL(url).host) {
        throw new Error(`接口被重定向到 ${next}：请把接口地址直接填成这个地址`)
      }
      url = next
    }

    throw new Error(`接口重定向超过 ${MAX_REDIRECTS} 次`)
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

/** 相对地址的 Location 也要能解析；解析不出来就当没有重定向，原样交给调用方报错 */
function resolveLocation(location: string, from: string): string {
  try {
    return new URL(location, from).toString()
  } catch {
    return from
  }
}

function readLocationHeader(headers: Record<string, string>): string | null {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === 'location' && value.trim() !== '') return value.trim()
  }
  return null
}

function toResponse(response: {
  data: unknown
  status: number
  headers: Record<string, string>
}): Response {
  const headers = new Headers()
  for (const [name, value] of Object.entries(response.headers)) headers.set(name, value)

  return new Response(
    typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
    { status: response.status, headers },
  )
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
