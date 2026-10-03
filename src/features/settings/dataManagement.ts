import type { AppServices } from '../../composition/root'
import { buildMemoryExport } from '../../core/memory/export'
import { DEFAULT_SESSION_ID } from '../../core/memory/types'
import { clearPersona, loadPersona } from '../persona/personaStorage'
import { clearStrategy, loadStrategy } from './strategyStorage'

/**
 * 数据管理：导出备份与两种清除。
 *
 * 这些动作都要碰 `Blob` / `URL` / `location` 等浏览器 API，因此留在 features
 * 层；序列化本身是纯逻辑，已放在 `core/memory/export.ts`。
 */

/** 把当前会话的对话、记忆与人设打包成 JSON 并触发下载。 */
export async function downloadMemoryExport(services: AppServices): Promise<void> {
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

  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `regret-backup-${formatDate(bundle.exportedAt)}.json`
  link.click()
  URL.revokeObjectURL(url)
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
  location.reload()
}

function formatDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}
