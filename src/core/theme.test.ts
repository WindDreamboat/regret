import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, normalizeTheme, resolveTheme } from './theme'

describe('normalizeTheme', () => {
  it('三个合法偏好原样保留', () => {
    for (const preference of ['system', 'light', 'dark'] as const) {
      expect(normalizeTheme(preference)).toBe(preference)
    }
  })

  it('枚举外的值退回跟随系统', () => {
    for (const invalid of ['Dark', 'auto', '', 1, null, undefined, {}]) {
      expect(normalizeTheme(invalid)).toBe(DEFAULT_THEME)
    }
  })
})

describe('resolveTheme', () => {
  it('钉死的偏好不受系统影响', () => {
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('dark', true)).toBe('dark')
  })

  it('跟随系统时按系统明暗取反着的那一个', () => {
    expect(resolveTheme('system', true)).toBe('light')
    expect(resolveTheme('system', false)).toBe('dark')
  })
})
