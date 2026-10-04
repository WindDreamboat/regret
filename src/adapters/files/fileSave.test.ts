import { describe, expect, it, vi } from 'vitest'
import { saveTextFile, type SavePorts } from './fileSave'

const INPUT = {
  fileName: 'regret-backup-2026-10-05.json',
  text: '{"format":"regret.memory-export"}',
}

/** 两个落盘途径都做成假件：单测只验选路与结果，真碰 DOM 与原生的是生产实现 */
function testPorts(overrides: Partial<SavePorts> = {}) {
  const defaults = {
    isNative: () => true,
    isPluginAvailable: () => true,
    saveWithSystem: vi.fn(async () => ({ uri: 'content://downloads/1' })),
    saveInBrowser: vi.fn(),
  }

  return { ...defaults, ...overrides }
}

describe('saveTextFile', () => {
  it('原生平台交给系统「另存为」，并回显途径与文件名', async () => {
    const ports = testPorts()

    const result = await saveTextFile(INPUT, ports)

    expect(result).toEqual({ kind: 'saved', via: 'system', fileName: INPUT.fileName })
    expect(ports.saveWithSystem).toHaveBeenCalledWith({
      fileName: INPUT.fileName,
      text: INPUT.text,
      mimeType: 'application/json',
    })
    // 已经交给系统了，不该再往浏览器下载目录悄悄放一份
    expect(ports.saveInBrowser).not.toHaveBeenCalled()
  })

  it('MIME 可由调用方覆盖', async () => {
    const ports = testPorts()

    await saveTextFile({ ...INPUT, mimeType: 'text/plain' }, ports)

    expect(ports.saveWithSystem).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'text/plain' }),
    )
  })

  it('用户在系统对话框里取消：算取消不算失败，也不回退浏览器下载', async () => {
    const cancelled = Object.assign(new Error('已取消'), { code: 'CANCELLED' })
    const ports = testPorts({
      saveWithSystem: vi.fn(async () => {
        throw cancelled
      }),
    })

    await expect(saveTextFile(INPUT, ports)).resolves.toEqual({
      kind: 'cancelled',
      via: 'system',
      fileName: INPUT.fileName,
    })
    expect(ports.saveInBrowser).not.toHaveBeenCalled()
  })

  it('系统保存真失败时向上抛原因，同样不回退——否则用户会以为没保存', async () => {
    const ports = testPorts({
      saveWithSystem: vi.fn(async () => {
        throw new Error('写入失败：No space left on device')
      }),
    })

    await expect(saveTextFile(INPUT, ports)).rejects.toThrow('No space left on device')
    expect(ports.saveInBrowser).not.toHaveBeenCalled()
  })

  it('Web 上、或原生平台里插件没装上时，退回浏览器下载', async () => {
    const web = testPorts({ isNative: () => false })
    const missing = testPorts({ isPluginAvailable: () => false })

    const expected = { kind: 'saved', via: 'browser', fileName: INPUT.fileName }
    await expect(saveTextFile(INPUT, web)).resolves.toEqual(expected)
    await expect(saveTextFile(INPUT, missing)).resolves.toEqual(expected)

    expect(web.saveInBrowser).toHaveBeenCalledWith({
      fileName: INPUT.fileName,
      text: INPUT.text,
      mimeType: 'application/json',
    })
    expect(missing.saveInBrowser).toHaveBeenCalledTimes(1)
  })
})
