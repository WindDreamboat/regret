import { describe, expect, it } from 'vitest'
import { applyFactOps, buildExtractionPrompt, filterActiveFacts, parseFactOps } from './extract'
import type { Fact, StoredMessage } from './types'

function fact(overrides: Partial<Fact> = {}): Fact {
  return {
    sessionId: 's1',
    key: 'user.drink',
    value: '拿铁',
    category: 'preference',
    confidence: 0.9,
    sourceMsgIds: [],
    firstSeenAt: 100,
    updatedAt: 100,
    status: 'confirmed',
    ...overrides,
  }
}

describe('applyFactOps', () => {
  it('upsert 新建事实并写入时间戳', () => {
    const result = applyFactOps(
      's1',
      [],
      [{ op: 'upsert', key: 'user.drink', value: '美式', category: 'preference', confidence: 0.9 }],
      1000,
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.value).toBe('美式')
    expect(result[0]?.firstSeenAt).toBe(1000)
    expect(result[0]?.updatedAt).toBe(1000)
    expect(result[0]?.status).toBe('confirmed')
  })

  it('upsert 覆盖同 key，保留 firstSeenAt 并刷新 updatedAt', () => {
    const result = applyFactOps(
      's1',
      [fact()],
      [{ op: 'upsert', key: 'user.drink', value: '美式', category: 'preference', confidence: 0.9 }],
      2000,
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.value).toBe('美式')
    expect(result[0]?.firstSeenAt).toBe(100)
    expect(result[0]?.updatedAt).toBe(2000)
  })

  it('delete 移除事实', () => {
    const result = applyFactOps('s1', [fact()], [{ op: 'delete', key: 'user.drink' }], 2000)
    expect(result).toEqual([])
  })

  it('置信度低于阈值时存为 pending', () => {
    const result = applyFactOps(
      's1',
      [],
      [{ op: 'upsert', key: 'user.job', value: '程序员', category: 'profile', confidence: 0.4 }],
      1000,
    )
    expect(result[0]?.status).toBe('pending')
  })

  it('已是 pending 的事实二次出现即升为 confirmed', () => {
    const result = applyFactOps(
      's1',
      [fact({ key: 'user.job', status: 'pending', confidence: 0.4 })],
      [{ op: 'upsert', key: 'user.job', value: '程序员', category: 'profile', confidence: 0.4 }],
      2000,
    )
    expect(result[0]?.status).toBe('confirmed')
  })

  it('保留 validUntil', () => {
    const result = applyFactOps(
      's1',
      [],
      [
        {
          op: 'upsert',
          key: 'user.interview',
          value: '下周面试',
          category: 'event',
          confidence: 0.9,
          validUntil: 5000,
        },
      ],
      1000,
    )
    expect(result[0]?.validUntil).toBe(5000)
  })

  it('保留 eventAt', () => {
    const result = applyFactOps(
      's1',
      [],
      [
        {
          op: 'upsert',
          key: 'user.interview',
          value: '面试',
          category: 'event',
          confidence: 0.9,
          eventAt: 3000,
        },
      ],
      1000,
    )
    expect(result[0]?.eventAt).toBe(3000)
  })

  it('覆盖式更新时保留既有的 followedUpAt', () => {
    const result = applyFactOps(
      's1',
      [fact({ key: 'user.interview', category: 'event', eventAt: 3000, followedUpAt: 5000 })],
      [{ op: 'upsert', key: 'user.interview', value: '面试', category: 'event', confidence: 0.9, eventAt: 3000 }],
      6000,
    )
    expect(result[0]?.followedUpAt).toBe(5000)
  })

  it('不修改传入的既有事实数组', () => {
    const existing = [fact()]
    applyFactOps(
      's1',
      existing,
      [{ op: 'upsert', key: 'user.drink', value: '美式', category: 'preference', confidence: 0.9 }],
      2000,
    )
    expect(existing[0]?.value).toBe('拿铁')
  })
})

describe('filterActiveFacts', () => {
  it('过滤掉 pending 事实', () => {
    const result = filterActiveFacts([fact({ key: 'a', status: 'pending' }), fact({ key: 'b' })], 1000)
    expect(result.map((item) => item.key)).toEqual(['b'])
  })

  it('过滤掉已过期事实', () => {
    const result = filterActiveFacts(
      [fact({ key: 'a', validUntil: 500 }), fact({ key: 'b', validUntil: 5000 })],
      1000,
    )
    expect(result.map((item) => item.key)).toEqual(['b'])
  })

  it('无 validUntil 视为长期有效', () => {
    expect(filterActiveFacts([fact({ key: 'a' })], 1000)).toHaveLength(1)
  })

  it('按 key 字典序排序', () => {
    const result = filterActiveFacts(
      [fact({ key: 'user.z' }), fact({ key: 'user.a' }), fact({ key: 'user.m' })],
      1000,
    )
    expect(result.map((item) => item.key)).toEqual(['user.a', 'user.m', 'user.z'])
  })
})

describe('parseFactOps', () => {
  it('解析合法的 upsert 与 delete 操作', () => {
    const raw = JSON.stringify({
      ops: [
        { op: 'upsert', key: 'user.drink', value: '美式', category: 'preference', confidence: 0.9 },
        { op: 'delete', key: 'user.city' },
      ],
    })

    const result = parseFactOps(raw)

    expect(result).toEqual([
      { op: 'upsert', key: 'user.drink', value: '美式', category: 'preference', confidence: 0.9 },
      { op: 'delete', key: 'user.city' },
    ])
  })

  it('保留 upsert 的 validUntil', () => {
    const raw = JSON.stringify({
      ops: [
        {
          op: 'upsert',
          key: 'user.interview',
          value: '下周面试',
          category: 'event',
          confidence: 0.9,
          validUntil: 5000,
        },
      ],
    })
    expect(parseFactOps(raw)?.[0]).toMatchObject({ validUntil: 5000 })
  })

  it('保留 upsert 的 eventAt', () => {
    const raw = JSON.stringify({
      ops: [
        {
          op: 'upsert',
          key: 'user.interview',
          value: '面试',
          category: 'event',
          confidence: 0.9,
          eventAt: 3000,
        },
      ],
    })
    expect(parseFactOps(raw)?.[0]).toMatchObject({ eventAt: 3000 })
  })

  it('eventAt 非数字返回 null', () => {
    expect(
      parseFactOps(
        JSON.stringify({
          ops: [{ op: 'upsert', key: 'a', value: 'b', category: 'c', confidence: 0.9, eventAt: '下周' }],
        }),
      ),
    ).toBeNull()
  })

  it('空 ops 数组视为合法，返回空数组', () => {
    expect(parseFactOps(JSON.stringify({ ops: [] }))).toEqual([])
  })

  it('非法 JSON 返回 null', () => {
    expect(parseFactOps('不是 json')).toBeNull()
  })

  it('顶层不是对象返回 null', () => {
    expect(parseFactOps('[1,2,3]')).toBeNull()
  })

  it('ops 不是数组返回 null', () => {
    expect(parseFactOps(JSON.stringify({ ops: 'nope' }))).toBeNull()
  })

  it('未知 op 返回 null', () => {
    expect(parseFactOps(JSON.stringify({ ops: [{ op: 'rename', key: 'a' }] }))).toBeNull()
  })

  it('upsert 缺字段返回 null', () => {
    expect(
      parseFactOps(JSON.stringify({ ops: [{ op: 'upsert', key: 'a', value: 'b' }] })),
    ).toBeNull()
  })

  it('confidence 非数字返回 null', () => {
    expect(
      parseFactOps(
        JSON.stringify({
          ops: [{ op: 'upsert', key: 'a', value: 'b', category: 'c', confidence: '高' }],
        }),
      ),
    ).toBeNull()
  })

  it('delete 缺 key 返回 null', () => {
    expect(parseFactOps(JSON.stringify({ ops: [{ op: 'delete' }] }))).toBeNull()
  })
})

describe('buildExtractionPrompt', () => {
  const transcript: StoredMessage[] = [
    { sessionId: 's1', role: 'user', content: '我最近改喝美式了', ts: 1 },
    { sessionId: 's1', role: 'assistant', content: '记下啦', ts: 2 },
  ]

  it('返回 system + user 两条消息', () => {
    expect(buildExtractionPrompt([], transcript).map((message) => message.role)).toEqual([
      'system',
      'user',
    ])
  })

  it('system 含输出格式说明与既有 key 列表', () => {
    const system = buildExtractionPrompt(['user.drink', 'user.city'], transcript)[0]?.content ?? ''
    expect(system).toContain('user.drink')
    expect(system).toContain('user.city')
    expect(system).toContain('upsert')
    expect(system).toContain('validUntil')
  })

  it('system 要求事件类事实附带 eventAt', () => {
    const system = buildExtractionPrompt([], transcript)[0]?.content ?? ''
    expect(system).toContain('eventAt')
  })

  it('user 消息按角色前缀渲染全部对话原文', () => {
    const user = buildExtractionPrompt([], transcript)[1]?.content ?? ''
    expect(user).toContain('用户：我最近改喝美式了')
    expect(user).toContain('伴侣：记下啦')
  })

  it('无既有 key 与空对话时也不抛错', () => {
    expect(buildExtractionPrompt([], [])).toHaveLength(2)
  })
})