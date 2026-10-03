/**
 * 伴侣的交互风格旋钮。
 *
 * 纯手动设置（V1 不存在自动推断或固化），注入主对话的 system 提示。
 * 六个旋钮均取值 0-1，0.5 为中性默认，即当前基线行为。
 */
export interface StrategyProfile {
  /** 主动开启话题的强度 */
  proactivity: number
  /** 共情表达的密度 */
  empathyDensity: number
  /** 幽默与调侃的倾向 */
  humor: number
  /** 关系推进的速度 */
  pace: number
  /** 回复的详细程度 */
  verbosity: number
  /** 提出不同意见的倾向 */
  challenge: number
}

/** challenge 的硬下限：不允许被设到 0，「永远顺从」是谄媚漂移的单点故障 */
export const CHALLENGE_MIN = 0.15

/** 中性默认档案：六项均为 0.5，等价于不施加任何风格偏移 */
export const DEFAULT_STRATEGY: StrategyProfile = {
  proactivity: 0.5,
  empathyDensity: 0.5,
  humor: 0.5,
  pace: 0.5,
  verbosity: 0.5,
  challenge: 0.5,
}

/**
 * 规范化旋钮档案。
 *
 * localStorage 属于不可信边界（规约第五节）：非对象整体退回默认；单个字段类型非法或非有限数
 * 退回该字段默认值；越界夹紧到 0-1；`challenge` 再取 `CHALLENGE_MIN` 下限。
 * 纯函数，不修改入参，始终返回新对象。
 */
export function normalizeStrategy(input: unknown): StrategyProfile {
  if (typeof input !== 'object' || input === null) return { ...DEFAULT_STRATEGY }
  const record = input as Record<string, unknown>

  return {
    proactivity: readKnob(record, 'proactivity'),
    empathyDensity: readKnob(record, 'empathyDensity'),
    humor: readKnob(record, 'humor'),
    pace: readKnob(record, 'pace'),
    verbosity: readKnob(record, 'verbosity'),
    challenge: Math.max(CHALLENGE_MIN, readKnob(record, 'challenge')),
  }
}

function readKnob(record: Record<string, unknown>, key: keyof StrategyProfile): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_STRATEGY[key]
  return Math.min(1, Math.max(0, value))
}
