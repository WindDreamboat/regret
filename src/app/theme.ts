import { CANVAS_COLOR, resolveTheme, type ResolvedTheme, type ThemePreference } from '../core/theme'

/**
 * 把主题偏好落到界面上：`<html data-theme>`、`color-scheme` 与浏览器主题色。
 *
 * 为什么要有这一层（而不是纯 CSS 媒体查询）：CSS 只认 `light` / `dark` 两个值，
 * 「跟随系统」在这里解析成具体明暗，所以令牌只写一份。
 *
 * 首屏不走这里——`index.html` 的内联脚本已在样式生效前把属性写好，避免冷启动闪一下。
 *
 * **不再碰 Android 状态栏**：装过 `@capacitor/status-bar` 并按主题改写底色与图标色，
 * 真机实测反而更糟——这台 EMUI 设备会把窗口底色（#fafafa）画进状态栏区域、盖掉
 * App 设置的颜色（`dumpsys` 里 `statusBarColor=#ff110a0a` 而屏幕实测 `#fafafa`），
 * 结果深色主题下变成"白底白图标"，完全不可见；系统默认的深色图标倒是始终可读。
 * 详见 `docs/Android打包指南.md` 的已知局限。
 */

const LIGHT_QUERY = '(prefers-color-scheme: light)'

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference, window.matchMedia(LIGHT_QUERY).matches)
  const root = document.documentElement

  root.dataset['theme'] = resolved
  root.style.colorScheme = resolved
  setBrowserChrome(resolved)

  return resolved
}

/**
 * 监听系统明暗变化。
 *
 * 只在偏好是「跟随系统」时才有意义，由调用方（App）决定是否订阅。
 * 返回取消订阅的函数。
 */
export function watchSystemTheme(handler: (resolved: ResolvedTheme) => void): () => void {
  const query = window.matchMedia(LIGHT_QUERY)
  const listener = () => handler(query.matches ? 'light' : 'dark')
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

/** 浏览器 UI 的主题色（Android Chrome 的地址栏、iOS 的顶栏） */
function setBrowserChrome(theme: ResolvedTheme): void {
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', CANVAS_COLOR[theme])
}
