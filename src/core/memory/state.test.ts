import { describe, expect, it } from 'vitest'
import { parseStateBlock, stripStateBlock } from './state'

describe('parseStateBlock', () => {
  it('剥离状态块，只留下正文', () => {
    const result = parseStateBlock('今天也想你呀。<state>{"mood":"温柔","energy":0.7,"affection_delta":1}</state>')
    expect(result.text).toBe('今天也想你呀。')
    expect(result.state).toEqual({ mood: '温柔', energy: 0.7, affectionDelta: 1 })
  })

  it('状态块出现在中间时，两侧正文拼接且不留空行', () => {
    const result = parseStateBlock('前半句<state>{"mood":"开心","energy":0.5,"affection_delta":0}</state>后半句')
    expect(result.text).toBe('前半句后半句')
    expect(result.state?.mood).toBe('开心')
  })

  it('没有状态块时原样返回，state 为 null', () => {
    const result = parseStateBlock('只是普通的一句话')
    expect(result.text).toBe('只是普通的一句话')
    expect(result.state).toBeNull()
  })

  it('affection_delta 可缺省，缺省时记为 0', () => {
    const result = parseStateBlock('<state>{"mood":"平静","energy":0.4}</state>')
    expect(result.state).toEqual({ mood: '平静', energy: 0.4, affectionDelta: 0 })
  })

  it('状态块 JSON 非法时，仍剥离标签但 state 为 null', () => {
    const result = parseStateBlock('好的<state>{不是 JSON}</state>')
    expect(result.text).toBe('好的')
    expect(result.state).toBeNull()
  })

  it('缺少 mood 或类型不对时，state 为 null', () => {
    expect(parseStateBlock('<state>{"energy":0.5}</state>').state).toBeNull()
    expect(parseStateBlock('<state>{"mood":123,"energy":0.5}</state>').state).toBeNull()
    expect(parseStateBlock('<state>{"mood":"温和","energy":"高"}</state>').state).toBeNull()
  })

  it('只有开标签没有闭标签时，剥掉未闭合的尾巴且不解析', () => {
    const result = parseStateBlock('正文<state>{"mood":"温和"}')
    expect(result.text).toBe('正文')
    expect(result.state).toBeNull()
  })

  it('energy 超出 0-1 范围时判为非法', () => {
    expect(parseStateBlock('<state>{"mood":"兴奋","energy":1.5}</state>').state).toBeNull()
    expect(parseStateBlock('<state>{"mood":"疲惫","energy":-0.1}</state>').state).toBeNull()
  })

  it('affection_delta 非有限数时判为非法', () => {
    expect(parseStateBlock('<state>{"mood":"开心","energy":0.5,"affection_delta":"多"}</state>').state).toBeNull()
  })
})

describe('stripStateBlock', () => {
  it('流式中的半截状态块不会露给用户', () => {
    expect(stripStateBlock('嗨，我在的<state>{"moo')).toBe('嗨，我在的')
    expect(stripStateBlock('嗨，我在的<st')).toBe('嗨，我在的<st')
  })

  it('完整状态块照常剥离，块后正文保留', () => {
    expect(stripStateBlock('前半<state>{"mood":"温和","energy":0.5}</state>后半')).toBe('前半后半')
  })

  it('没有状态块时原样返回', () => {
    expect(stripStateBlock('普通一句话')).toBe('普通一句话')
  })
})