import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { createChatHandler } from './handler.ts'

const CHAT_ROUTE = '/api/chat'

/**
 * 开发期把 /api/chat 挂到 Vite dev server 上。
 *
 * 生产环境把同一个 handler 部署为 serverless function 即可，前端代码不用改。
 */
export function devApiPlugin(): Plugin {
  const handleChat = createChatHandler()

  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(CHAT_ROUTE, (request, response, next) => {
        forward(request, response, handleChat).catch(next)
      })
    },
  }
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
      headers: { 'Content-Type': 'application/json' },
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
