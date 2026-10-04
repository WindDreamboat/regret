import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import { loadEnv, type Plugin } from 'vite'
import { createChatHandler } from './handler.ts'

const CHAT_ROUTE = '/api/chat'

/** 逐跳头与长度相关头由 Request 依据实际 body 重建，原样转发会让上游解析出错 */
const UNFORWARDED_HEADERS = new Set(['host', 'connection', 'content-length', 'transfer-encoding'])

/**
 * 开发期把 /api/chat 挂到 Vite dev server 上。
 *
 * 生产环境把同一个 handler 部署为 serverless function 即可，前端代码不用改。
 */
export function devApiPlugin(): Plugin {
  let handleChat = createChatHandler()

  return {
    name: 'dev-api',
    // 连接配置来自环境变量，必须显式加载 .env（Vite 只把它给 import.meta.env，
    // 不会注入 process.env），否则 `npm run dev` 下的 /api/chat 只会回 500。
    configResolved(config) {
      handleChat = createChatHandler({ env: loadProxyEnv(config.mode, config.root) })
    },
    configureServer(server) {
      server.middlewares.use(CHAT_ROUTE, (request, response, next) => {
        forward(request, response, handleChat).catch(next)
      })
    },
  }
}

/**
 * 读取代理侧的环境变量：`.env` 系列文件与环境变量合并，已有的环境变量优先。
 *
 * 前缀传空串是**有意**的——代理的 Key / 网关 / 模型都刻意不加 `VITE_` 前缀（那会被打进前端产物），
 * 若沿用默认的 `VITE_` 前缀，线上最关键的 `DEEPSEEK_API_KEY` 恰好读不到。
 */
export function loadProxyEnv(mode: string, root: string): Record<string, string> {
  return loadEnv(mode, root, '')
}

/**
 * 把 Node 的请求头转成 Web 标准头。
 *
 * 不能只带 `Content-Type`：设置页的连接配置靠 `Authorization` / `X-Chat-Base-Url` / `X-Chat-Model`
 * 透传，丢掉这些头会让「页面填的 Key」在开发环境里静默失效（回退到代理 env）。
 */
export function toRequestHeaders(raw: IncomingHttpHeaders): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined || UNFORWARDED_HEADERS.has(name.toLowerCase())) continue
    headers.set(name, Array.isArray(value) ? value.join(', ') : value)
  }
  return headers
}

async function forward(
  request: IncomingMessage,
  response: ServerResponse,
  handleChat: (request: Request) => Promise<Response>,
): Promise<void> {
  const origin = `http://${request.headers.host ?? 'localhost'}`
  const body = await readBody(request)

  const webResponse = await handleChat(
    new Request(`${origin}${CHAT_ROUTE}`, {
      method: request.method ?? 'POST',
      headers: toRequestHeaders(request.headers),
      body: body === '' ? undefined : body,
    }),
  )

  response.statusCode = webResponse.status
  webResponse.headers.forEach((value, key) => response.setHeader(key, value))

  if (!webResponse.body) {
    response.end()
    return
  }

  for await (const chunk of webResponse.body) {
    response.write(chunk)
  }
  response.end()
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}
