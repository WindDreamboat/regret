import { describe, expect, it } from 'vitest'
import { backupFileName } from './dataManagement'

describe('backupFileName', () => {
  /**
   * 用本地日历字段构造时刻，期望值因此与运行机器的时区无关
   * （换 UTC 组装就会变成"只在东八区成立"的脆弱断言）。
   */
  it('日期取自本地日历，月与日补零', () => {
    expect(backupFileName(new Date(2026, 0, 5, 12, 0).getTime())).toBe(
      'regret-backup-2026-01-05.json',
    )
    expect(backupFileName(new Date(2026, 11, 31, 23, 55).getTime())).toBe(
      'regret-backup-2026-12-31.json',
    )
  })

  it('本地刚过午夜时仍算当天——UTC 日期会退到前一天（真机 00:50 曾导出 10-04）', () => {
    expect(backupFileName(new Date(2026, 9, 5, 0, 50).getTime())).toBe(
      'regret-backup-2026-10-05.json',
    )
  })
})
