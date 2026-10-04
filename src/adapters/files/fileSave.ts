import { Capacitor } from '@capacitor/core'
import { FileSave } from '@regret/file-save'

/**
 * 把文本落成设备上的文件。
 *
 * 打包版**必须**交给系统：Android WebView 既不处理 `<a download href="blob:">`（实测点击后
 * `/sdcard/Download` 无新文件、logcat 无任何下载活动，是一次静默空点击），也没有
 * `navigator.share`（Chrome 114 WebView 里 `typeof navigator.share === 'undefined'`），
 * 所以只能由原生层弹系统「另存为」。
 *
 * Web 部署与开发环境仍用 Blob 下载，行为与引入前一致。
 */

export interface SaveTextFileInput {
  /** 建议的文件名；系统对话框会预填，浏览器用它当下载名 */
  fileName: string
  text: string
  /** MIME 类型，默认 `application/json` */
  mimeType?: string
}

export interface SaveResult {
  kind: 'saved' | 'cancelled'
  /** 落盘途径：`system` 是系统的「另存为」，`browser` 是浏览器的下载 */
  via: 'system' | 'browser'
  /** 实际使用的文件名，供界面回显 */
  fileName: string
}

/**
 * 两个落盘途径的可替换实现。
 *
 * 暴露出来只为可测：选路、取消与失败的判定都在本模块，而 `Blob` / `URL` / 原生桥
 * 碰不得 node 环境（单测跑在 `environment: 'node'` 下，跨层行为交给 e2e 与真机）。
 */
export interface SavePorts {
  isNative: () => boolean
  isPluginAvailable: () => boolean
  saveWithSystem: (input: Required<SaveTextFileInput>) => Promise<unknown>
  saveInBrowser: (input: Required<SaveTextFileInput>) => void
}

const DEFAULT_MIME = 'application/json'

export async function saveTextFile(
  input: SaveTextFileInput,
  ports: SavePorts = defaultPorts(),
): Promise<SaveResult> {
  const fileName = input.fileName
  const request: Required<SaveTextFileInput> = {
    fileName,
    text: input.text,
    mimeType: input.mimeType ?? DEFAULT_MIME,
  }

  if (ports.isNative() && ports.isPluginAvailable()) {
    try {
      await ports.saveWithSystem(request)
      return { kind: 'saved', via: 'system', fileName }
    } catch (cause) {
      // 取消与失败必须分开：取消是用户的决定，报红等于把选择说成故障；
      // 而失败更不能悄悄改成浏览器下载——用户会以为保存成功。
      if (isCancelled(cause)) return { kind: 'cancelled', via: 'system', fileName }
      throw cause
    }
  }

  ports.saveInBrowser(request)
  return { kind: 'saved', via: 'browser', fileName }
}

/** 原生侧在用户放弃保存时以 `CANCELLED` 拒绝，见 `plugins/file-save` */
function isCancelled(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { code?: unknown }).code === 'CANCELLED'
  )
}

function defaultPorts(): SavePorts {
  return {
    isNative: () => Capacitor.isNativePlatform(),
    isPluginAvailable: () => Capacitor.isPluginAvailable('FileSave'),
    saveWithSystem: (request) => FileSave.saveText(request),
    saveInBrowser: downloadInBrowser,
  }
}

/**
 * 浏览器兜底：Blob + 隐藏链接。
 *
 * 链接要先挂进文档再点——Firefox 对游离节点不触发下载；回收放也要挪到下一个宏任务，
 * 立刻 `revokeObjectURL` 有内核会把这次下载当成被取消。
 */
function downloadInBrowser({ fileName, text, mimeType }: Required<SaveTextFileInput>): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'

  document.body.append(link)
  link.click()
  link.remove()

  setTimeout(() => URL.revokeObjectURL(url), 0)
}
