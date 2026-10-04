import { normalizeTheme, type ThemePreference } from '../../core/theme'

const STORAGE_KEY = 'regret.theme'

/**
 * 主题偏好的本地存储。
 *
 * localStorage 属于不可信边界（规约第五节）：读出的值一律经 `normalizeTheme` 规范化，
 * 存储不可用（隐私模式、被清）时退回默认的「跟随系统」。
 *
 * 键名写死在两处：这里与 `index.html` 里防闪的内联脚本。存成常量也没法共享
 * （内联脚本不能 import 模块），所以改动时两处一起改——e2e 会验切换后刷新仍生效。
 */
export function loadTheme(): ThemePreference {
  try {
    return normalizeTheme(localStorage.getItem(STORAGE_KEY))
  } catch {
    return normalizeTheme(undefined)
  }
}

/** 保存主题偏好 */
export function saveTheme(preference: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, normalizeTheme(preference))
  } catch {
    // 存不了就只作用于这一次会话，不打断用户
  }
}
