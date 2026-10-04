import { registerPlugin } from '@capacitor/core'

/**
 * 系统的「另存为」。
 *
 * `saveText()` 打开系统文件保存对话框，用户选好位置后才写入并 resolve；用户在对话框里
 * 放弃时以 `code: 'CANCELLED'` 拒绝——取消是用户的决定，不是故障，调用方按 `code` 区分。
 *
 * Web 上没有原生实现，调用方应先 `Capacitor.isPluginAvailable('FileSave')` 判断。
 */
export const FileSave = registerPlugin('FileSave')
