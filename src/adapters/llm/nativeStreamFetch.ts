import { Capacitor } from '@capacitor/core'
import { StreamHttp } from '@regret/stream-http'
import type { FetchLike } from './DeepSeekAdapter'

/**
 * 原生**流式**传输：请求由宿主 App 发出（绕过同源策略），响应逐行送回。
 *
 * 与 `createNativeFetch()` 的分工：
 * - 本文件（流式）用于厂商**会逐字吐**的接口。实测上游首字 18.8 s、之后连续吐约 50 s；
 *   整包返回意味着那七十秒界面上什么都没有，而这里能把每一行及时交给适配器。
 * - `createNativeFetch()`（整包）是它的兜底：插件不可用或读流失败时仍能拿到完整结果。
 *
 * 两端都返回标准 `Response`，因此适配器的 SSE 解析、逐字节奏、光标全部照旧生效。
 */
export function createNativeStreamFetch(): FetchLike | undefined {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('StreamHttp')) return undefined

  ensureListeners()

  return async (input, init) => {
    const id = crypto.randomUUID()
    const encoder = new TextEncoder()

    /** 事件可能早于 ReadableStream 建立（原生层拿到响应头就开始吐），先攒着 */
    const pending: string[] = []
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null
    let phase: 'waiting' | 'open' | 'closed' = 'waiting'
    let status = 200
    let headers = new Headers()
    let failure: Error | null = null
    let settleStart: () => void = () => {}
    let failStart: (error: Error) => void = () => {}
    const started = new Promise<void>((resolve, reject) => {
      settleStart = resolve
      failStart = reject
    })

    sessions.set(id, {
      onStart(event) {
        status = event.status
        headers = new Headers(event.headers)
        if (phase === 'waiting') {
          phase = 'open'
          settleStart()
        }
      },
      onLine(event) {
        if (controller === null) {
          pending.push(event.line)
          return
        }
        controller.enqueue(encoder.encode(`${event.line}\n`))
      },
      onEnd() {
        phase = 'closed'
        sessions.delete(id)
        // 响应在建流之前就结束了：交回 start() 收尾
        if (controller !== null) safely(() => controller?.close())
      },
      onError(message) {
        const error = new Error(message)
        failure = error
        sessions.delete(id)
        if (phase === 'waiting') {
          failStart(error)
          return
        }
        phase = 'closed'
        if (controller !== null) safely(() => controller?.error(error))
      },
    })

    await StreamHttp.request({
      id,
      url: input,
      method: init.method ?? 'POST',
      headers: readHeaders(init.headers),
      ...(typeof init.body === 'string' ? { data: init.body } : {}),
    })
    await started

    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController
        for (const line of pending.splice(0)) streamController.enqueue(encoder.encode(`${line}\n`))
        if (failure !== null) {
          safely(() => streamController.error(failure))
          return
        }
        if (phase === 'closed') safely(() => streamController.close())
      },
      cancel() {
        sessions.delete(id)
        void StreamHttp.abort({ id })
      },
    })

    return new Response(stream, { status, headers })
  }
}

interface SessionHandlers {
  onStart: (event: { status: number; headers: Record<string, string> }) => void
  onLine: (event: { line: string }) => void
  onEnd: () => void
  onError: (message: string) => void
}

const sessions = new Map<string, SessionHandlers>()
let listenersReady = false

/** 事件都带请求 id，因此模块级只订阅一次、按 id 分发即可支持并发 */
function ensureListeners(): void {
  if (listenersReady) return
  listenersReady = true

  void StreamHttp.addListener('streamStart', (event) => sessions.get(event.id)?.onStart(event))
  void StreamHttp.addListener('streamLine', (event) => sessions.get(event.id)?.onLine(event))
  void StreamHttp.addListener('streamEnd', (event) => sessions.get(event.id)?.onEnd())
  void StreamHttp.addListener('streamError', (event) =>
    sessions.get(event.id)?.onError(event.message),
  )
}

/** 流已关闭后再 close/error 会抛错，这里只是避免噪声 */
function safely(action: () => void): void {
  try {
    action()
  } catch {
    // 已经关闭或已出错，忽略
  }
}

/** 适配器只传普通对象形式的头；其余形态在这里统一成对象 */
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
