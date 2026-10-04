/**
 * 主题偏好的纯逻辑：类型、规范化、解析、与画布同色的常量。
 *
 * 不碰 DOM 也不碰存储，因此可以在 node 环境单测（`environment: 'node'`）。
 * 落盘在 `features/settings/themeStorage.ts`，应用（写 `data-theme`、通知原生状态栏）
 * 在 `app/theme.ts`。
 */

/** 用户的主题偏好：跟随系统（默认），或钉死明/暗 */
export type ThemePreference = 'system' | 'light' | 'dark'

/** 偏好解析后的实际主题 */
export type ResolvedTheme = 'light' | 'dark'

export const DEFAULT_THEME: ThemePreference = 'system'

const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark']

/**
 * 画布底色，与 `index.css` 里 `--c-canvas` 同值。
 *
 * 浏览器 UI（`<meta name="theme-color">`）与 Android 状态栏都要具体色值，拿不到 oklch 令牌，
 * 所以在这里再写一份——e2e 会断言它与 CSS 令牌同色，改一边忘另一边会被测出来。
 */
export const CANVAS_COLOR: Record<ResolvedTheme, string> = {
  dark: '#110a0a',
  light: '#f4eae9',
}

/** 枚举外的值（含 undefined、大小写不符）一律退回默认，与其余配置的读法一致 */
export function normalizeTheme(value: unknown): ThemePreference {
  return PREFERENCES.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : DEFAULT_THEME
}

/**
 * 把偏好解析成实际主题。
 *
 * 「跟随系统」的判断放在调用方：`systemIsLight` 由 `prefers-color-scheme` 读出，
 * 于是这条规则本身是纯函数、可单测。
 */
export function resolveTheme(preference: ThemePreference, systemIsLight: boolean): ResolvedTheme {
  if (preference === 'system') return systemIsLight ? 'light' : 'dark'
  return preference
}
