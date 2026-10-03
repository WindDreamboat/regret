import type { ChatMessage } from '../llm/protocol'
import type { Fact, FactOp, FactStatus, StoredMessage } from './types'

/** 低于此置信度的事实先记为 pending，二次出现才升为 confirmed */
export const CONFIDENCE_THRESHOLD = 0.6

/**
 * 解析模型返回的事实抽取结果。
 *
 * 模型输出是不可信边界，任一条目不合法即整体判为失败返回 null，
 * 避免半可信数据污染记忆。手写守卫，不引 zod（规约第五节）。
 */
export function parseFactOps(raw: string): FactOp[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isRecord(parsed)) return null

  const ops = parsed['ops']
  if (!Array.isArray(ops)) return null

  const result: FactOp[] = []
  for (const item of ops) {
    const op = parseFactOp(item)
    if (op === null) return null
    result.push(op)
  }
  return result
}

function parseFactOp(item: unknown): FactOp | null {
  if (!isRecord(item)) return null

  const op = item['op']
  const key = item['key']
  if (typeof key !== 'string') return null

  if (op === 'delete') return { op: 'delete', key }

  if (op === 'upsert') {
    const value = item['value']
    const category = item['category']
    const confidence = item['confidence']
    if (typeof value !== 'string') return null
    if (typeof category !== 'string') return null
    if (typeof confidence !== 'number') return null

    const validUntil = item['validUntil']
    if (validUntil !== undefined && typeof validUntil !== 'number') return null

    const eventAt = item['eventAt']
    if (eventAt !== undefined && typeof eventAt !== 'number') return null

    return {
      op: 'upsert',
      key,
      value,
      category,
      confidence,
      ...(validUntil === undefined ? {} : { validUntil }),
      ...(eventAt === undefined ? {} : { eventAt }),
    }
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * 应用一批事实操作，返回合并后的事实列表。
 *
 * 以 key 覆盖式更新：同 key 的 upsert 直接覆盖，不残留冲突值（对应「改口」场景）。
 * 纯函数，不修改传入的 existing。
 */
export function applyFactOps(
  sessionId: string,
  existing: readonly Fact[],
  ops: readonly FactOp[],
  now: number,
): Fact[] {
  const map = new Map<string, Fact>(existing.map((item) => [item.key, { ...item }]))

  for (const op of ops) {
    if (op.op === 'delete') {
      map.delete(op.key)
      continue
    }

    const prev = map.get(op.key)
    map.set(op.key, {
      sessionId,
      key: op.key,
      value: op.value,
      category: op.category,
      confidence: Math.max(op.confidence, prev?.confidence ?? 0),
      validUntil: op.validUntil,
      eventAt: op.eventAt,
      // 已追问标记不因再次抽取而丢失，避免重复追问同一事件
      followedUpAt: prev?.followedUpAt,
      sourceMsgIds: prev ? [...prev.sourceMsgIds] : [],
      firstSeenAt: prev?.firstSeenAt ?? now,
      updatedAt: now,
      status: resolveStatus(op.confidence, prev),
    })
  }

  return Array.from(map.values())
}

/** 置信度达阈值即 confirmed；此前已是 pending 的，二次出现也升为 confirmed。 */
function resolveStatus(confidence: number, prev: Fact | undefined): FactStatus {
  if (confidence >= CONFIDENCE_THRESHOLD) return 'confirmed'
  return prev?.status === 'pending' ? 'confirmed' : 'pending'
}

/** 过滤出可注入 prompt 的事实：仅 confirmed、未过期，并按 key 字典序排序（稳定缓存前缀）。 */
export function filterActiveFacts(facts: readonly Fact[], now: number): Fact[] {
  return facts
    .filter((item) => item.status === 'confirmed')
    .filter((item) => item.validUntil === undefined || item.validUntil > now)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

/** 抽取 prompt 的固定标记，供测试替身识别抽取请求 */
export const EXTRACTION_MARKER = '事实抽取'

const EXTRACTION_INSTRUCTION = [
  `你是${EXTRACTION_MARKER}器。从对话中抽取关于用户的稳定事实，只输出 JSON，不要任何解释。`,
  '输出格式：{"ops":[{"op":"upsert","key":"...","value":"...","category":"...","confidence":0.0-1.0}]}',
  '规则：',
  '- 用户改口时以新说法为准，同一 key 直接 upsert 覆盖；',
  '- 事件类事实必须附带 eventAt（事件发生时间）与 validUntil（失效时间），均为毫秒时间戳；',
  '- 不确定的表述把 confidence 设在 0.6 以下；',
  '- 需要删除已失效的事实，用 {"op":"delete","key":"..."}。',
].join('\n')

/**
 * 构造事实抽取请求：一段系统指令 + 一段待抽取的对话原文。
 *
 * 把当前已有事实的 key 交给模型，避免它自造重复 key（需求 5.4）。
 */
export function buildExtractionPrompt(
  knownKeys: readonly string[],
  transcript: readonly StoredMessage[],
): ChatMessage[] {
  const known = knownKeys.length > 0 ? knownKeys.join('、') : '（暂无）'
  const system = `${EXTRACTION_INSTRUCTION}\n已有事实 key（避免自造重复 key）：${known}`
  const text = transcript.map((message) => `${label(message.role)}：${message.content}`).join('\n')
  return [
    { role: 'system', content: system },
    { role: 'user', content: text },
  ]
}

function label(role: StoredMessage['role']): string {
  return role === 'user' ? '用户' : '伴侣'
}