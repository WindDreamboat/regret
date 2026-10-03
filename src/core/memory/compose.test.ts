import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../llm/protocol'
import type { Persona } from '../persona/types'
import { DEFAULT_MAX_HISTORY, composePrompt } from './compose'

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

describe('composePrompt', () => {
  it('人设卡总是第一条，且为 system 角色', () => {
    const result = composePrompt(persona, [])
    expect(result).toHaveLength(1)
    expect(result[0]?.role).toBe('system')
  })

  it('人设卡包含全部已填写字段', () => {
    const card = composePrompt(persona, [])[0]?.content ?? ''
    expect(card).toContain('小满')
    expect(card).toContain('阿泽')
    expect(card).toContain('温和，爱吐槽')
    expect(card).toContain('在一家旧书店工作')
  })

  it('同一人设生成的前缀稳定，可供上下文缓存命中', () => {
    const first = composePrompt(persona, [{ role: 'user', content: '在吗' }])[0]?.content
    const second = composePrompt(persona, [{ role: 'user', content: '今天好累' }])[0]?.content
    expect(first).toBe(second)
  })

  it('字段缺省时不抛错，且省略对应小节', () => {
    const result = composePrompt(blankPersona, [])
    expect(result).toHaveLength(1)
    expect(result[0]?.content).not.toContain('#')
    expect(result[0]?.content?.trim()).not.toBe('')
  })

  it('只填写部分字段时，仅渲染已填写的小节', () => {
    const card = composePrompt({ ...blankPersona, name: '小满' }, [])[0]?.content ?? ''
    expect(card).toContain('小满')
    expect(card).not.toContain('背景故事')
  })

  it('历史消息按原顺序接在人设卡之后', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: '在吗' },
      { role: 'assistant', content: '在的' },
    ]
    const result = composePrompt(persona, history)
    expect(result).toHaveLength(3)
    expect(result.slice(1)).toEqual(history)
  })

  it('历史超长时保留最近的消息', () => {
    const history: ChatMessage[] = Array.from({ length: DEFAULT_MAX_HISTORY + 10 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `第 ${i} 条`,
    }))

    const result = composePrompt(persona, history)

    expect(result).toHaveLength(DEFAULT_MAX_HISTORY + 1)
    expect(result.at(-1)?.content).toBe(`第 ${DEFAULT_MAX_HISTORY + 9} 条`)
  })

  it('截断后若窗口首条为 assistant，则丢弃以避免历史以伴侣发言开头', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: '1' },
      { role: 'assistant', content: '2' },
      { role: 'user', content: '3' },
      { role: 'assistant', content: '4' },
      { role: 'user', content: '5' },
    ]

    const result = composePrompt(persona, history, { maxHistory: 2 })

    expect(result).toHaveLength(2)
    expect(result[1]?.content).toBe('5')
  })

  it('不修改传入的历史数组', () => {
    const history: ChatMessage[] = [{ role: 'user', content: '在吗' }]
    composePrompt(persona, history)
    expect(history).toHaveLength(1)
  })
})
