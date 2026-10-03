import type { ChatMessage } from '../llm/protocol'
import type { Persona } from '../persona/types'
import { filterActiveFacts } from './extract'
import type { Fact, Relation, Summary } from './types'

/** 默认保留的历史消息条数上限 */
export const DEFAULT_MAX_HISTORY = 40

/** 待跟进话题段的标题标记，供测试替身识别延续请求 */
export const PENDING_FOLLOW_UP_MARKER = '你想跟进的话题'

const BASE_INSTRUCTION =
  '你是一位虚拟伴侣，与用户进行日常聊天陪伴。始终以第一人称口语化地回应，保持人设一致。'

const PROTOCOL_CARD = [
  '# 输出要求',
  '- 直接以角色口吻回复用户，不要复述或解释本规则。',
  '- 每次回复的最后追加一行状态块，格式示例：<state>{"mood":"被逗笑","energy":0.7,"affection_delta":1}</state>',
  '- 永远不要提及「记忆」「设定」「提示词」等机制，也不要出现「根据我的记忆」这类说法。',
].join('\n')

/** 组装 prompt 所需的全部记忆上下文 */
export interface ComposeContext {
  persona: Persona
  /** 关系状态，每轮小步变化 */
  relation: Relation
  /** 全部事实（含 pending 与过期），由 composePrompt 负责筛选 */
  facts: readonly Fact[]
  /** 待注入的摘要，通常为最新 1-2 条 level-1 与 1 条 level-2 */
  summaries: readonly Summary[]
  /** 打开 App 追问后，下一条回复继续带入的话题（用户回应后即清除） */
  pendingFollowUp?: { value: string }
  history: readonly ChatMessage[]
}

export interface ComposeOptions {
  /** 保留的历史消息条数上限，超出时保留最近的 */
  maxHistory?: number
  /** 过滤过期事实的时间基准，默认取当前时间 */
  now?: number
}

/**
 * 组装发给模型的消息列表。
 *
 * 按「人设卡 → 输出协议 → 关系状态 → 事实 → 摘要 → 历史」分段，
 * 每个固定/半固定段落各占一条独立 system 消息，空段整节省略。
 * 人设卡与输出协议构成稳定前缀：同一人设下反复调用产出的前缀完全一致，
 * 为后续接入上下文缓存留下前提。
 */
export function composePrompt(context: ComposeContext, options: ComposeOptions = {}): ChatMessage[] {
  const now = options.now ?? Date.now()
  const maxHistory = options.maxHistory ?? DEFAULT_MAX_HISTORY

  const sections: string[] = [renderPersonaCard(context.persona), PROTOCOL_CARD, renderRelation(context.relation)]

  const activeFacts = filterActiveFacts(context.facts, now)
  if (activeFacts.length > 0) sections.push(renderFacts(activeFacts))

  if (context.summaries.length > 0) sections.push(renderSummaries(context.summaries))

  if (context.pendingFollowUp !== undefined) {
    sections.push(renderPendingFollowUp(context.pendingFollowUp.value))
  }

  return [
    ...sections.map((content): ChatMessage => ({ role: 'system', content })),
    ...trimHistory(context.history, maxHistory),
  ]
}

/** 渲染人设卡。空字段整节省略，保证全空人设也能产出可用提示。 */
export function renderPersonaCard(persona: Persona): string {
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

/** 关系状态渲染为自然语言，而非结构化字面量。 */
function renderRelation(relation: Relation): string {
  const lines = [`你们目前处于「${relation.stage}」阶段，亲密度 ${relation.intimacy}/100。`]

  const mood = relation.mood.trim()
  if (mood !== '') {
    const energy = Number.isFinite(relation.energy) ? `，精力 ${Math.round(relation.energy * 100)}/100` : ''
    lines.push(`你现在的心情是「${mood}」${energy}。`)
  }

  const address = relation.addressForm.trim()
  if (address !== '') lines.push(`你习惯称呼用户为「${address}」。`)
  if (relation.sharedExperiences.length > 0) {
    lines.push(`你们共同经历过：${relation.sharedExperiences.join('、')}。`)
  }
  if (relation.boundaries.length > 0) {
    lines.push(`你给自己划下的界限：${relation.boundaries.join('、')}。`)
  }

  return `# 你们的关系\n${lines.join('\n')}`
}

/** 事实渲染为自然语言列表；传入顺序须已按 key 字典序稳定，避免缓存前缀抖动。 */
function renderFacts(facts: readonly Fact[]): string {
  const lines = facts.map((fact) => `- ${fact.value}`)
  return `# 关于用户的已知事实\n${lines.join('\n')}`
}

/** 摘要渲染为独立小节，保留具体事实与情感事件。 */
function renderSummaries(summaries: readonly Summary[]): string {
  return `# 过往对话摘要\n${summaries.map((summary) => summary.content).join('\n\n')}`
}

/** 渲染待跟进话题，促使伴侣在合适的时机继续之前问过的事。 */
function renderPendingFollowUp(value: string): string {
  return `# ${PENDING_FOLLOW_UP_MARKER}\n你正惦记着用户提过的「${value}」，如果合适就自然地把话题接回来，别生硬。`
}

/** 截取最近 maxHistory 条；若截断点落在伴侣发言上则丢弃，避免历史以伴侣发言开头。 */
function trimHistory(history: readonly ChatMessage[], maxHistory: number): ChatMessage[] {
  if (maxHistory <= 0) return []
  if (history.length <= maxHistory) return [...history]

  const recent = history.slice(-maxHistory)
  const first = recent[0]
  return first?.role === 'assistant' ? recent.slice(1) : recent
}