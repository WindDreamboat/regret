import type { PluginListenerHandle } from '@capacitor/core'

export interface StreamHttpRequestOptions {
  /** 调用方生成的请求 id；所有事件都会带上它 */
  id: string
  url: string
  method?: string
  headers?: Record<string, string>
  /** 请求体（字符串，原样发送） */
  data?: string
  /** 毫秒；默认 30000 */
  connectTimeout?: number
  /** 毫秒；默认 180000（上游网关实测偶尔要 60 s 以上才吐完） */
  readTimeout?: number
}

export interface StreamStartEvent {
  id: string
  status: number
  headers: Record<string, string>
}

export interface StreamLineEvent {
  id: string
  /** 一行原始文本（不含换行符） */
  line: string
}

export interface StreamErrorEvent {
  id: string
  message: string
}

export interface StreamHttpPlugin {
  request(options: StreamHttpRequestOptions): Promise<{ id: string }>
  /** 中断请求（读流被取消时调用） */
  abort(options: { id: string }): Promise<void>
  addListener(
    eventName: 'streamStart',
    listenerFunc: (event: StreamStartEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'streamLine',
    listenerFunc: (event: StreamLineEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'streamEnd',
    listenerFunc: (event: { id: string }) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'streamError',
    listenerFunc: (event: StreamErrorEvent) => void,
  ): Promise<PluginListenerHandle>
}

export const StreamHttp: StreamHttpPlugin
