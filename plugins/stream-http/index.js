import { registerPlugin } from '@capacitor/core'

/**
 * 原生流式 HTTP。
 *
 * `request()` 立刻回执一个 `id`，随后服务器返回的每一行都以 `streamLine` 事件送回；
 * 请求与状态以 `streamStart` / `streamEnd` / `streamError` 收尾。
 * 事件全部带同一个 `id`，因此调用方可以并发多个请求。
 *
 * Web 上没有原生实现，调用方应先 `Capacitor.isPluginAvailable('StreamHttp')` 判断。
 */
export const StreamHttp = registerPlugin('StreamHttp')
