import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppServices } from '../../composition/root'
import { composePrompt } from '../../core/memory/compose'
import { buildExtractionPrompt, parseFactOps } from '../../core/memory/extract'
import { buildProactivePrompt, selectFollowUp, type ProactiveKind } from '../../core/memory/followUp'
import { parseStateBlock, type StateBlock } from '../../core/memory/state'
import type { Fact, Relation, StoredMessage } from '../../core/memory/types'
import { DEFAULT_SESSION_ID } from '../../core/memory/types'
import type { Persona } from '../../core/persona/types'
import type { StrategyProfile } from '../../core/strategy/types'

const SESSION_ID = DEFAULT_SESSION_ID

/** 距上次抽取累计满 6 轮往返（12 条消息）才触发一次异步抽取 */
const EXTRACTION_INTERVAL_MESSAGES = 12

/**
 * 单次抽取最多送入的原文条数。
 *
 * 抽取游标（`extractedCountRef`）不持久化，刷新后会归零；若不设上限，
 * 一次触发就会把整段历史打包发给模型。与主链路的历史上限同量级即可。
 */
const EXTRACTION_WINDOW_MESSAGES = 40

/** 距上次消息超过该时长（4 小时）才视为「重新打开」，可主动追问 */
const RETURN_GAP_MS = 4 * 60 * 60 * 1000

export interface UseChatResult {
  messages: StoredMessage[]
  /** 当前关系状态，供界面展示阶段、亲密度与情绪 */
  relation: Relation | null
  /** 正在流式生成中的回复文本（已剥离状态块） */
  draft: string
  isGenerating: boolean
  error: string | null
  send: (text: string) => Promise<void>
}

export function useChat(
  services: AppServices,
  persona: Persona,
  strategy: StrategyProfile,
): UseChatResult {
  const [messages, setMessages] = useState<StoredMessage[]>([])
  const [relation, setRelation] = useState<Relation | null>(null)
  const [draft, setDraft] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 用 ref 保存当前值，避免在流式过程中读到过期的闭包状态
  const messagesRef = useRef<StoredMessage[]>([])
  const generatingRef = useRef(false)
  const extractedCountRef = useRef(0)
  /** 主动开场只跑一次，规避 StrictMode 下 effect 双调用 */
  const openedRef = useRef(false)
  /** 追问开场后待延续的话题，下一条回复带上后清除 */
  const pendingFollowUpRef = useRef<{ value: string } | null>(null)

  const applyMessages = useCallback((next: StoredMessage[]) => {
    messagesRef.current = next
    setMessages(next)
  }, [])

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
        // 游标之后、且不超过窗口上限；越老的原文此前已抽过，事实已落库
        const from = Math.max(extractedCountRef.current, all.length - EXTRACTION_WINDOW_MESSAGES)
        const transcript = all.slice(from)
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

  /** 把模型给出的状态块并入关系状态：亲密度按增量累加并夹在 0-100，同时更新情绪与精力。 */
  const applyState = useCallback(
    async (state: StateBlock) => {
      const current = await services.memoryStore.getRelation(SESSION_ID)
      const intimacy = Math.min(100, Math.max(0, current.intimacy + state.affectionDelta))
      const next = { intimacy, mood: state.mood, energy: state.energy, updatedAt: Date.now() }
      await services.memoryStore.updateRelation(SESSION_ID, next)
      setRelation({ ...current, ...next })
    },
    [services],
  )

  /**
   * 打开 App 时的主动开场。
   *
   * 无消息则说欢迎语；距上次消息超过 4 小时且存在到期事件时主动追问。
   * 独立于发消息主链路，失败只记 console；追问后把话题暂存，供下一条回复延续。
   */
  const runOpening = useCallback(
    async (history: readonly StoredMessage[]) => {
      let kind: ProactiveKind = 'welcome'
      let event: Fact | null = null

      if (history.length > 0) {
        const lastTs = history[history.length - 1]?.ts ?? 0
        if (Date.now() - lastTs < RETURN_GAP_MS) return

        const facts = await services.memoryStore.listFacts(SESSION_ID)
        event = selectFollowUp(facts, Date.now())
        if (event === null) return
        kind = 'followUp'
      }

      generatingRef.current = true
      setIsGenerating(true)
      try {
        let raw = ''
        for await (const streamEvent of services.chatProvider.stream(
          buildProactivePrompt(persona, kind, event ?? undefined),
        )) {
          if (streamEvent.type === 'delta') {
            raw += streamEvent.text
            setDraft(parseStateBlock(raw).text)
          } else if (streamEvent.type === 'error') {
            setError(streamEvent.message)
            break
          }
        }

        const parsed = parseStateBlock(raw)
        if (parsed.text === '') return

        const opening: StoredMessage = {
          sessionId: SESSION_ID,
          role: 'assistant',
          content: parsed.text,
          ts: Date.now(),
        }
        await services.memoryStore.appendMessage(opening)
        applyMessages([...messagesRef.current, opening])

        if (parsed.state !== null) await applyState(parsed.state)

        if (kind === 'followUp' && event !== null) {
          await services.memoryStore.markFactFollowedUp(SESSION_ID, event.key, Date.now())
          pendingFollowUpRef.current = { value: event.value }
        }
      } catch (cause) {
        console.error('主动开场失败', cause)
      } finally {
        setDraft('')
        setIsGenerating(false)
        generatingRef.current = false
      }
    },
    [services, persona, applyMessages, applyState],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [stored, currentRelation] = await Promise.all([
        services.memoryStore.listMessages(SESSION_ID),
        services.memoryStore.getRelation(SESSION_ID),
      ])
      if (cancelled) return

      applyMessages(stored)
      setRelation(currentRelation)

      if (openedRef.current) return
      openedRef.current = true
      await runOpening(stored)
    })()
    return () => {
      cancelled = true
    }
  }, [services, applyMessages, runOpening])

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

        // 追问开场后只在下一条回复里延续该话题，随后清除
        const followUp = pendingFollowUpRef.current
        pendingFollowUpRef.current = null

        let reply = ''
        for await (const event of services.chatProvider.stream(
          composePrompt({
            persona,
            relation,
            facts,
            summaries,
            strategy,
            history,
            pendingFollowUp: followUp ?? undefined,
          }),
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
    [services, persona, strategy, applyMessages, applyState, runExtraction],
  )

  return { messages, relation, draft, isGenerating, error, send }
}