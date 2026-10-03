import { DEFAULT_STRATEGY, normalizeStrategy, type StrategyProfile } from '../../core/strategy/types'

const STORAGE_KEY = 'regret.strategy'

/**
 * 读取旋钮设置。
 *
 * localStorage 属于不可信边界（规约第五节）：缺失或损坏时退回默认，
 * 其余一律经 `normalizeStrategy` 规范化，保证读出的值永远是合法档案。
 */
export function loadStrategy(): StrategyProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { ...DEFAULT_STRATEGY }
    return normalizeStrategy(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_STRATEGY }
  }
}

/** 保存旋钮设置；写入前同样规范化，避免把越界值落库。 */
export function saveStrategy(strategy: StrategyProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeStrategy(strategy)))
}

/** 清除已保存的旋钮设置；清除后 `loadStrategy` 会回到默认档案。 */
export function clearStrategy(): void {
  localStorage.removeItem(STORAGE_KEY)
}
