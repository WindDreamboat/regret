import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../llm/protocol'
import type { Persona } from '../persona/types'
import { DEFAULT_MAX_HISTORY, composePrompt, type ComposeContext } from './compose'
import type { Fact, Relation, Summary } from './types'

const persona: Persona = {
  name: '小满',
  userAddress: '阿泽',
  personality: '温和，爱吐槽',
  background: '在一家旧书店工作',
}

const blankPersona: Persona = {
  name: '',
  userAddress: '',
  personality: '',
  background: '',
}

const relation: Relation = {
  sessionId: 'default',
  stage: '熟悉',
  intimacy: 42,
  mood: '被逗笑',
  energy: 0.7,
  addressForm: '阿泽',
  sharedExperiences: ['看了一场电影'],
  boundaries: ['不提对方的家人'],
  updatedAt: 0,
}

function fact(overrides: Partial<Fact> = {}): Fact {
  return {
    sessionId: 'default',
    key: 'user.drink',
    value: '美式',
    category: 'preference',
    confidence: 0.9,
    sourceMsgIds: [],
    firstSeenAt: 0,
    updatedAt: 0,
    status: 'confirmed',
    ...overrides,
  }
}

function summary(overrides: Partial<Summary> = {}): Summary {
  return {
    sessionId: 'default',
    level: 1,
    coversFromId: 1,
    coversToId: 5,
    content: '用户提过下周有面试',
    ts: 0,
    ...overrides,
  }
}

function context(overrides: Partial<ComposeContext> = {}): ComposeContext {
  return { persona, relation, facts: [], summaries: [], history: [], ...overrides }
}

/** 找到包含指定关键词的 system 消息内容，找不到返回 undefined */
function section(result: ChatMessage[], keyword: string): string | undefined {
  return result.find((message) => message.content.includes(keyword))?.content
}

describe('composePrompt', () => {
  it('人设卡始终是第一条 system 消息，包含全部已填写字段', () => {
    const result = composePrompt(context())
    expect(result[0]?.role).toBe('system')
    const card = result[0]?.content ?? ''
    expect(card).toContain('小满')
    expect(card).toContain('阿泽')
    expect(card).toContain('温和，爱吐槽')
    expect(card).toContain('在一家旧书店工作')
  })

  it('人设字段缺省时不抛错，且省略对应小节', () => {
    const result = composePrompt(context({ persona: blankPersona }))
    const card = result[0]?.content ?? ''
    expect(card).not.toContain('#')
    expect(card.trim()).not.toBe('')
  })

  it('只填写部分字段时，仅渲染已填写的小节', () => {
    const card = composePrompt(context({ persona: { ...blankPersona, name: '小满' } }))[0]?.content ?? ''
    expect(card).toContain('小满')
    expect(card).not.toContain('背景故事')
  })

  it('以独立 system 消息给出输出协议，含状态块格式与不点破记忆的约束', () => {
    const result = composePrompt(context())
    expect(result[1]?.role).toBe('system')
    const protocol = result[1]?.content ?? ''
    expect(protocol).toContain('<state>')
    expect(protocol).toContain('affection_delta')
    expect(protocol).toContain('energy')
    expect(protocol).toContain('记忆')
  })

  it('关系状态以自然语言渲染，含阶段、亲密度与称呼', () => {
    const card = section(composePrompt(context()), '你们的关系') ?? ''
    expect(card).toContain('熟悉')
    expect(card).toContain('42')
    expect(card).toContain('阿泽')
    expect(card).toContain('看了一场电影')
    expect(card).toContain('不提对方的家人')
  })

  it('关系状态渲染当前情绪与精力', () => {
    const card = section(composePrompt(context()), '你们的关系') ?? ''
    expect(card).toContain('被逗笑')
    expect(card).toContain('70')
  })

  it('心情为空时省略情绪一行', () => {
    const card = section(composePrompt(context({ relation: { ...relation, mood: '' } })), '你们的关系') ?? ''
    expect(card).not.toContain('心情')
  })

  it('事实按 key 字典序渲染，而非输入顺序', () => {
    const facts = [fact({ key: 'user.drink', value: '美式' }), fact({ key: 'user.city', value: '上海' })]
    const card = section(composePrompt(context({ facts })), '已知事实') ?? ''
    expect(card).toContain('美式')
    expect(card).toContain('上海')
    // user.city < user.drink，字典序要求「上海」排在「美式」之前
    expect(card.indexOf('上海')).toBeLessThan(card.indexOf('美式'))
  })

  it('pending 事实不注入', () => {
    const facts = [fact({ key: 'user.secret', value: '低置信事实', status: 'pending' })]
    const result = composePrompt(context({ facts }))
    expect(result.some((message) => message.content.includes('低置信事实'))).toBe(false)
    expect(section(result, '已知事实')).toBeUndefined()
  })

  it('过期事实不注入，未过期事实照常注入', () => {
    const expired = fact({ key: 'user.interview', value: '下周面试', validUntil: 500 })
    const alive = fact({ key: 'user.city', value: '上海', validUntil: 2000 })

    const expiredOnly = composePrompt(context({ facts: [expired] }), { now: 1000 })
    expect(expiredOnly.some((message) => message.content.includes('下周面试'))).toBe(false)

    const mixed = section(composePrompt(context({ facts: [expired, alive] }), { now: 1000 }), '已知事实')
    expect(mixed).toContain('上海')
    expect(mixed).not.toContain('下周面试')
  })

  it('无可用事实时整节省略，不产生空 system 消息', () => {
    const result = composePrompt(context())
    expect(section(result, '已知事实')).toBeUndefined()
  })

  it('摘要渲染为独立小节，无摘要时省略', () => {
    const withSummary = section(composePrompt(context({ summaries: [summary()] })), '摘要')
    expect(withSummary).toContain('用户提过下周有面试')

    const without = composePrompt(context())
    expect(section(without, '摘要')).toBeUndefined()
  })

  it('存在待跟进话题时渲染为独立 system 段', () => {
    const card = section(composePrompt(context({ pendingFollowUp: { value: '面试' } })), '跟进') ?? ''
    expect(card).toContain('面试')
  })

  it('无待跟进话题时整节省略', () => {
    expect(section(composePrompt(context()), '跟进')).toBeUndefined()
  })

  it('历史消息按原顺序接在所有 system 小节之后', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: '在吗' },
      { role: 'assistant', content: '在的' },
    ]
    const result = composePrompt(context({ history, facts: [fact()], summaries: [summary()] }))
    expect(result.slice(-2)).toEqual(history)
    expect(result.slice(0, -2).every((message) => message.role === 'system')).toBe(true)
  })

  it('同一人设与记忆下，system 前缀稳定，可供上下文缓存命中', () => {
    const first = composePrompt(context({ history: [{ role: 'user', content: '在吗' }] }))
    const second = composePrompt(context({ history: [{ role: 'user', content: '今天好累' }] }))
    expect(first[0]).toEqual(second[0])
    expect(first[1]).toEqual(second[1])
    expect(first[2]).toEqual(second[2])
  })

  it('历史超长时保留最近的消息', () => {
    const history: ChatMessage[] = Array.from({ length: DEFAULT_MAX_HISTORY + 10 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `第 ${i} 条`,
    }))

    const result = composePrompt(context({ history }))

    expect(result.at(-1)?.content).toBe(`第 ${DEFAULT_MAX_HISTORY + 9} 条`)
    const historyPart = result.filter((message) => message.role !== 'system')
    expect(historyPart).toHaveLength(DEFAULT_MAX_HISTORY)
  })

  it('截断后若窗口首条为 assistant，则丢弃以避免历史以伴侣发言开头', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: '1' },
      { role: 'assistant', content: '2' },
      { role: 'user', content: '3' },
      { role: 'assistant', content: '4' },
      { role: 'user', content: '5' },
    ]

    const result = composePrompt(context({ history }), { maxHistory: 2 })
    const historyPart = result.filter((message) => message.role !== 'system')
    expect(historyPart).toHaveLength(1)
    expect(historyPart[0]?.content).toBe('5')
  })

  it('不修改传入的历史数组', () => {
    const history: ChatMessage[] = [{ role: 'user', content: '在吗' }]
    composePrompt(context({ history }))
    expect(history).toHaveLength(1)
  })
})