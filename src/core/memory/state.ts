/** 模型在回复末尾附加的一行状态块，格式：<state>{"mood":"...","energy":0.7,"affection_delta":1}</state> */
export interface StateBlock {
  mood: string
  /** 精力，0-1 */
  energy: number
  /** 本轮亲密度增量 */
  affectionDelta: number
}

export interface ParsedState {
  /** 剥离状态块后的可展示正文 */
  text: string
  /** 解析出的状态；缺失或非法时为 null */
  state: StateBlock | null
}

const BLOCK_PATTERN = /<state>([\s\S]*?)<\/state>/g

/**
 * 从回复中剥离 `<state>` 块并解析其内容。
 *
 * 无论 JSON 是否合法，标签都会被剥离，避免把原始标签展示给用户；
 * 模型输出是不可信边界，字段类型不符即判为非法（规约第五节）。
 */
export function parseStateBlock(content: string): ParsedState {
  const text = content.replace(BLOCK_PATTERN, '').trim()
  const match = content.match(/<state>([\s\S]*?)<\/state>/)
  const raw = match?.[1]
  if (raw === undefined) return { text, state: null }

  return { text, state: parseState(raw) }
}

function parseState(raw: string): StateBlock | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const mood = record['mood']
  const energy = record['energy']
  if (typeof mood !== 'string') return null
  if (typeof energy !== 'number' || !Number.isFinite(energy) || energy < 0 || energy > 1) return null

  const delta = record['affection_delta']
  if (delta === undefined) return { mood, energy, affectionDelta: 0 }
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return null

  return { mood, energy, affectionDelta: delta }
}