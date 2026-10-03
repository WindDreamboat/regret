import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppServices } from '../../composition/root'
import { composePrompt } from '../../core/memory/compose'
import type { StoredMessage } from '../../core/memory/types'
import type { Persona } from '../../core/persona/types'

const SESSION_ID = 'default'

export interface UseChatResult {
  messages: StoredMessage[]
  /** 正在流式生成中的回复文本 */
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

        let reply = ''
        for await (const event of services.chatProvider.stream(composePrompt(persona, history))) {
          if (event.type === 'delta') {
            reply += event.text
            setDraft(reply)
          } else if (event.type === 'error') {
            setError(event.message)
            break
          }
        }

        if (reply !== '') {
          const assistantMessage: StoredMessage = {
            sessionId: SESSION_ID,
            role: 'assistant',
            content: reply,
            ts: Date.now(),
          }
          await services.memoryStore.appendMessage(assistantMessage)
          applyMessages([...history, assistantMessage])
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setDraft('')
        setIsGenerating(false)
        generatingRef.current = false
      }
    },
    [services, persona, applyMessages],
  )

  return { messages, draft, isGenerating, error, send }
}
