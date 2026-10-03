import type { ChatMessage } from '../llm/protocol'
import type { Persona } from '../persona/types'

/** 默认保留的历史消息条数上限 */
export const DEFAULT_MAX_HISTORY = 40

const BASE_INSTRUCTION =
  '你是一位虚拟伴侣，与用户进行日常聊天陪伴。始终以第一人称口语化地回应，保持人设一致。'

export interface ComposeOptions {
  /** 保留的历史消息条数上限，超出时保留最近的 */
  maxHistory?: number
}

/**
 * 组装发给模型的消息列表。
 *
 * 人设卡固定置于最前，构成稳定前缀：同一人设下反复调用产出的前缀完全一致，
 * 为后续接入上下文缓存留下前提。
 */
export function composePrompt(
  persona: Persona,
  history: readonly ChatMessage[],
  options: ComposeOptions = {},
): ChatMessage[] {
  const maxHistory = options.maxHistory ?? DEFAULT_MAX_HISTORY
  return [{ role: 'system', content: renderPersonaCard(persona) }, ...trimHistory(history, maxHistory)]
}

/** 渲染人设卡。空字段整节省略，保证全空人设也能产出可用提示。 */
function renderPersonaCard(persona: Persona): string {
  const sections: string[] = [BASE_INSTRUCTION]

  addSection(sections, '你的名字', persona.name)
  addSection(sections, '你对用户的称呼', persona.userAddress)
  addSection(sections, '你的性格', persona.personality)
  addSection(sections, '你的背景故事', persona.background)

  return sections.join('\n\n')
}

function addSection(sections: string[], title: string, value: string): void {
  const trimmed = value.trim()
  if (trimmed === '') return
  sections.push(`# ${title}\n${trimmed}`)
}

/** 截取最近 maxHistory 条；若截断点落在伴侣发言上则丢弃，避免历史以伴侣发言开头。 */
function trimHistory(history: readonly ChatMessage[], maxHistory: number): ChatMessage[] {
  if (maxHistory <= 0) return []
  if (history.length <= maxHistory) return [...history]

  const recent = history.slice(-maxHistory)
  const first = recent[0]
  return first?.role === 'assistant' ? recent.slice(1) : recent
}
