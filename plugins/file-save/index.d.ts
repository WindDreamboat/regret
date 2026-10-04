export interface SaveTextOptions {
  /** 建议的文件名，系统对话框会预填 */
  fileName: string
  /** 要写入的文本（按 UTF-8 编码） */
  text: string
  /** 系统对话框用的 MIME 类型，默认 `application/json` */
  mimeType?: string
}

export interface SaveTextResult {
  /** 落盘位置（`content://…`），仅供日志与排查 */
  uri: string
}

export interface FileSavePlugin {
  /**
   * 弹系统「另存为」并写入文本。
   *
   * 取消时以 `code: 'CANCELLED'` 拒绝；写入失败时以错误信息拒绝。
   */
  saveText(options: SaveTextOptions): Promise<SaveTextResult>
}

export declare const FileSave: FileSavePlugin
