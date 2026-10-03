import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppServices } from '../../composition/root'
import { composePrompt } from '../../core/memory/compose'
import { buildExtractionPrompt, parseFactOps } from '../../core/memory/extract'
import { parseStateBlock, type StateBlock } from '../../core/memory/state'
import type { StoredMessage } from '../../core/memory/types'
import type { Persona } from '../../core/persona/types'

const SESSION_ID = 'default'

/** 距上次抽取累计满 6 轮往返（12 条消息）才触发一次异步抽取 */
const EXTRACTION_INTERVAL_MESSAGES = 12

export interface UseChatResult {
  messages: StoredMessage[]
  /** 正在流式生成中的回复文本（已剥离状态块） */
  draft: string
  isGenerating: boolean
  error: string | null
  send: (text: string) => Promise<void>
}

export function useChat(services: AppServices, persona: Persona): UseChatResult {
  const [messages, setMessages] = useState<StoredMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 用 ref 保存当前值，避免在流式过程中读到过期的闭包状态
  const messagesRef = useRef<StoredMessage[]>([])
  const generatingRef = useRef(false)
  const extractedCountRef = useRef(0)

  const applyMessages = useCallback((next: StoredMessage[]) => {
    messagesRef.current = next
    setMessages(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    void services.memoryStore.listMessages(SESSION_ID).then((stored) => {
      if (!cancelled) applyMessages(stored)
    })
    return () => {
      cancelled = true
    }
  }, [services, applyMessages])

  /**
   * 异步批量抽取事实。
   *
   * 离开关键路径：主链路只做一次模型调用，这里独立 try/catch，
   * 失败仅记 console，不影响用户看到的回复（需求 5.3）。
   */
  const runExtraction = useCallback(
    async (all: StoredMessage[]) => {
      try {
        const facts = await services.memoryStore.listFacts(SESSION_ID)
        const knownKeys = facts.map((fact) => fact.key)
        const transcript = all.slice(extractedCountRef.current)
        if (transcript.length === 0) return

        let raw = ''
        for await (const event of services.chatProvider.stream(
          buildExtractionPrompt(knownKeys, transcript),
        )) {
          if (event.type === 'delta') raw += event.text
          else if (event.type === 'error') return
        }

        const ops = parseFactOps(raw)
        if (ops === null || ops.length === 0) {
          extractedCountRef.current = all.length
          return
        }

        await services.memoryStore.applyFactOps(SESSION_ID, ops, Date.now())
        extractedCountRef.current = all.length
      } catch (cause) {
        console.error('事实抽取失败', cause)
      }
    },
    [services],
  )

  /** 把模型给出的状态块并入关系状态：亲密度按增量累加并夹在 0-100。 */
  const applyState = useCallback(
    async (state: StateBlock) => {
      const relation = await services.memoryStore.getRelation(SESSION_ID)
      const intimacy = Math.min(100, Math.max(0, relation.intimacy + state.affectionDelta))
      await services.memoryStore.updateRelation(SESSION_ID, { intimacy, updatedAt: Date.now() })
    },
    [services],
  )

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (trimmed === '' || generatingRef.current) return

      generatingRef.current = true
      setIsGenerating(true)
      setError(null)
      setDraft('')

      try {
        const userMessage: StoredMessage = {
          sessionId: SESSION_ID,
          role: 'user',
          content: trimmed,
          ts: Date.now(),
        }
        await services.memoryStore.appendMessage(userMessage)

        const history = [...messagesRef.current, userMessage]
        applyMessages(history)

        const [relation, facts, summaries] = await Promise.all([
          services.memoryStore.getRelation(SESSION_ID),
          services.memoryStore.listFacts(SESSION_ID),
          services.memoryStore.listSummaries(SESSION_ID),
        ])

        let reply = ''
        for await (const event of services.chatProvider.stream(
          composePrompt({ persona, relation, facts, summaries, history }),
        )) {
          if (event.type === 'delta') {
            reply += event.text
            // 先剥离状态块，避免流式过程中把 <state> 标签露给用户
            setDraft(parseStateBlock(reply).text)
          } else if (event.type === 'error') {
            setError(event.message)
            break
          }
        }

        const parsed = parseStateBlock(reply)
        if (parsed.text !== '') {
          const assistantMessage: StoredMessage = {
            sessionId: SESSION_ID,
            role: 'assistant',
            content: parsed.text,
            ts: Date.now(),
          }
          await services.memoryStore.appendMessage(assistantMessage)
          applyMessages([...history, assistantMessage])
        }

        if (parsed.state !== null) await applyState(parsed.state)

        const next = messagesRef.current
        if (next.length - extractedCountRef.current >= EXTRACTION_INTERVAL_MESSAGES) {
          void runExtraction(next)
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setDraft('')
        setIsGenerating(false)
        generatingRef.current = false
      }
    },
    [services, persona, applyMessages, applyState, runExtraction],
  )

  return { messages, draft, isGenerating, error, send }
}