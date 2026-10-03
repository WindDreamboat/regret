import { describe, expect, it, vi } from 'vitest'
import type { ChatMessage, StreamEvent } from '../../core/llm/protocol'
import { DeepSeekAdapter, type FetchLike } from './DeepSeekAdapter'

const messages: ChatMessage[] = [{ role: 'user', content: '在吗' }]

/** 用给定的文本分片构造 SSE 响应，分片边界可任意切割事件 */
function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, { status })
}

function deltaChunk(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`
}

async function collect(events: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const collected: StreamEvent[] = []
  for await (const event of events) collected.push(event)
  return collected
}

function adapterOf(outcome: Response | Error): DeepSeekAdapter {
  const fetchImpl = vi.fn(async () => {
    if (outcome instanceof Error) throw outcome
    return outcome
  }) as unknown as FetchLike
  return new DeepSeekAdapter({ fetchImpl })
}

function textOf(events: StreamEvent[]): string {
  return events
    .filter((event): event is { type: 'delta'; text: string } => event.type === 'delta')
    .map((event) => event.text)
    .join('')
}

describe('DeepSeekAdapter', () => {
  it('拼接多个分片并以下发 done 结束', async () => {
    const adapter = adapterOf(
      sseResponse([deltaChunk('你'), deltaChunk('好'), 'data: [DONE]\n\n']),
    )

    const events = await collect(adapter.stream(messages))

    expect(textOf(events)).toBe('你好')
    expect(events.at(-1)).toEqual({ type: 'done' })
  })

  it('事件被分片切断时仍能正确缓冲还原', async () => {
    const whole = deltaChunk('你好')
    const adapter = adapterOf(sseResponse([whole.slice(0, 12), whole.slice(12)]))

    const events = await collect(adapter.stream(messages))

    expect(textOf(events)).toBe('你好')
  })

  it('忽略注释行与非 data 行', async () => {
    const adapter = adapterOf(
      sseResponse([': keep-alive\n\n', 'event: message\n', deltaChunk('嗨')]),
    )

    const events = await collect(adapter.stream(messages))

    expect(textOf(events)).toBe('嗨')
  })

  it('响应结构异常时跳过而不抛出', async () => {
    const adapter = adapterOf(
      sseResponse(['data: {"choices":[]}\n\n', 'data: 不是合法 JSON\n\n', deltaChunk('嗨')]),
    )

    const events = await collect(adapter.stream(messages))

    expect(textOf(events)).toBe('嗨')
    expect(events.some((event) => event.type === 'error')).toBe(false)
  })

  it('非 2xx 响应产生 error 事件', async () => {
    const adapter = adapterOf(sseResponse([], 401))

    const events = await collect(adapter.stream(messages))

    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('error')
  })

  it('请求失败时产生 error 事件而非抛出', async () => {
    const adapter = adapterOf(new Error('网络不可达'))

    const events = await collect(adapter.stream(messages))

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'error', message: expect.stringContaining('网络不可达') })
  })

  it('请求发往配置的端点', async () => {
    const fetchImpl = vi.fn(async () => sseResponse(['data: [DONE]\n\n'])) as unknown as FetchLike
    const adapter = new DeepSeekAdapter({ endpoint: '/custom', fetchImpl })

    await collect(adapter.stream(messages))

    expect(fetchImpl).toHaveBeenCalledWith('/custom', expect.objectContaining({ method: 'POST' }))
  })
})
