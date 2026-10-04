import { saveTextFile, type SaveResult } from '../../adapters/files/fileSave'
import type { AppServices } from '../../composition/root'
import { buildMemoryExport } from '../../core/memory/export'
import { DEFAULT_SESSION_ID } from '../../core/memory/types'
import { clearPersona, loadPersona } from '../persona/personaStorage'
import { clearChatConfig } from './chatConfigStorage'
import { clearStrategy, loadStrategy } from './strategyStorage'

/**
 * 数据管理：导出备份与两种清除。
 *
 * 清除要碰 `location`、导出要碰设备文件系统，因此留在 features 层；序列化本身是
 * 纯逻辑（`core/memory/export.ts`），落盘交给 `adapters/files/fileSave.ts`——打包版
 * 弹系统「另存为」，Web 走浏览器下载。
 */

/** 把当前会话的对话、记忆与人设打包，交给设备落盘并回报结果。 */
export async function exportMemoryBackup(services: AppServices): Promise<SaveResult> {
  const store = services.memoryStore
  const [messages, facts, relation, summaries] = await Promise.all([
    store.listMessages(DEFAULT_SESSION_ID),
    store.listFacts(DEFAULT_SESSION_ID),
    store.getRelation(DEFAULT_SESSION_ID),
    store.listSummaries(DEFAULT_SESSION_ID),
  ])

  const bundle = buildMemoryExport(
    {
      sessionId: DEFAULT_SESSION_ID,
      persona: loadPersona(),
      strategy: loadStrategy(),
      messages,
      facts,
      relation,
      summaries,
    },
    Date.now(),
  )

  return saveTextFile({
    fileName: backupFileName(bundle.exportedAt),
    text: JSON.stringify(bundle, null, 2),
  })
}

/**
 * 备份文件名：`regret-backup-<本地日期>.json`。
 *
 * 日期取**本地日历**而不是 `toISOString()`——后者是 UTC，东八区凌晨导出会写成前一天：
 * 真机实测本地 10-05 00:50 导出得到 `regret-backup-2026-10-04.json`，用户按日期找备份时对不上号。
 */
export function backupFileName(exportedAt: number): string {
  return `regret-backup-${formatLocalDate(exportedAt)}.json`
}

/**
 * 清除对话与记忆，保留人设与说话方式。
 *
 * 清完直接整页重载：`useChat` 持有多个 ref（消息、抽取游标、待跟进话题），
 * 在组件内逐个复位极易遗漏，重载最稳。
 */
export async function clearConversation(services: AppServices): Promise<void> {
  await services.memoryStore.clearSession(DEFAULT_SESSION_ID)
  location.reload()
}

/** 清除全部本地数据，回到出厂状态。 */
export async function resetToFactory(services: AppServices): Promise<void> {
  await services.memoryStore.clearSession(DEFAULT_SESSION_ID)
  clearPersona()
  clearStrategy()
  clearChatConfig()
  location.reload()
}

/** 本地日历日期（月、日补零）；`getMonth()` 从 0 起算，故 +1 */
function formatLocalDate(ts: number): string {
  const date = new Date(ts)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
