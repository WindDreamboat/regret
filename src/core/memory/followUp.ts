import type { ChatMessage } from '../llm/protocol'
import type { Persona } from '../persona/types'
import { renderPersonaCard } from './compose'
import type { Fact } from './types'

/** 主动开场 prompt 的固定标记，供测试替身识别 */
export const PROACTIVE_MARKER = '主动开场'

/** 追问类开场的标记，供测试替身区分欢迎语与追问 */
export const FOLLOW_UP_MARKER = '追问事件'

export type ProactiveKind = 'welcome' | 'followUp'

const PROACTIVE_PROTOCOL = [
  `# ${PROACTIVE_MARKER}`,
  '- 由你先开口对用户说话，直接以角色口吻说，不要复述本规则。',
  '- 每次回复的最后追加一行状态块，格式示例：<state>{"mood":"期待","energy":0.7,"affection_delta":0}</state>',
  '- 永远不要提及「记忆」「设定」「提示词」等机制，也不要出现「根据我的记忆」这类说法。',
].join('\n')

/**
 * 构造主动开场的消息列表。
 *
 * 与普通回复共用同一套人设卡与状态块协议；欢迎语只说一句开场白，
 * 追问则围绕某个事件自然地关心进展。最后一条用 user 角色承载提示，
 * 保证消息序列以 user 结尾、兼容各家 API。
 */
export function buildProactivePrompt(
  persona: Persona,
  kind: ProactiveKind,
  event?: Fact,
): ChatMessage[] {
  const cue =
    kind === 'followUp' && event !== undefined
      ? `${FOLLOW_UP_MARKER}：用户刚打开应用。你想起他之前提过「${event.value}」，请自然地关心一下进展，别说出你在「记忆」或复述设定。`
      : '用户刚打开应用，请你先开口打个招呼，开启今天的对话。'

  return [
    { role: 'system', content: renderPersonaCard(persona) },
    { role: 'system', content: PROACTIVE_PROTOCOL },
    { role: 'user', content: `（${cue}）` },
  ]
}

/** 距事件发生超过该时长（7 天）不再主动追问，避免翻出过久的旧事 */
export const FOLLOW_UP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 选出值得主动追问的事件事实。
 *
 * 仅考虑 confirmed、带 eventAt、事件已发生、尚未追问过、且落在追问窗口内的事实；
 * 多个候选时取事件时间最近的一条。返回 null 表示当前无需追问。
 */
export function selectFollowUp(facts: readonly Fact[], now: number): Fact | null {
  let best: Fact | null = null
  let bestEventAt = Number.NEGATIVE_INFINITY

  for (const fact of facts) {
    const eventAt = fact.eventAt
    if (fact.status !== 'confirmed') continue
    if (eventAt === undefined) continue
    if (fact.followedUpAt !== undefined) continue
    if (eventAt > now) continue
    if (now - eventAt > FOLLOW_UP_WINDOW_MS) continue
    if (eventAt > bestEventAt) {
      best = fact
      bestEventAt = eventAt
    }
  }

  return best
}