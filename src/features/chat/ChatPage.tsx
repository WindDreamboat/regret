import { useState } from 'react'
import type { AppServices } from '../../composition/root'
import type { Speaker } from '../../core/llm/protocol'
import type { Persona } from '../../core/persona/types'
import type { StrategyProfile } from '../../core/strategy/types'
import { useChat } from './useChat'

export interface ChatPageProps {
  services: AppServices
  persona: Persona
  strategy: StrategyProfile
  onOpenPersona: () => void
  onOpenSettings: () => void
}

/**
 * 只渲染最近若干条消息。
 *
 * 主链路的 prompt 已由 `DEFAULT_MAX_HISTORY` 封顶，但界面对每一条消息都生成气泡，
 * 长对话下 DOM 与每次按键的重渲成本会无限增长。更早的消息仍完整保存在本地。
 */
const VISIBLE_MESSAGE_LIMIT = 60

export function ChatPage({ services, persona, strategy, onOpenPersona, onOpenSettings }: ChatPageProps) {
  const { messages, relation, draft, isGenerating, error, send } = useChat(services, persona, strategy)
  const [input, setInput] = useState('')

  const submit = () => {
    const text = input
    setInput('')
    void send(text)
  }

  const hiddenCount = Math.max(0, messages.length - VISIBLE_MESSAGE_LIMIT)
  const visibleMessages = hiddenCount > 0 ? messages.slice(-VISIBLE_MESSAGE_LIMIT) : messages

  return (
    <>
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h1 className="text-base font-medium">
          {persona.name.trim() === '' ? '虚拟伴侣' : persona.name}
        </h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenPersona}
            className="rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          >
            人设
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          >
            设置
          </button>
        </div>
      </header>

      {relation !== null && (
        <div
          data-testid="relation-bar"
          className="flex items-center gap-2 border-b border-neutral-800 px-4 py-1.5 text-xs text-neutral-500"
        >
          <span>{relation.stage}</span>
          <span>·</span>
          <span>亲密度 {relation.intimacy}</span>
          {relation.mood.trim() !== '' && (
            <>
              <span>·</span>
              <span>{relation.mood}</span>
            </>
          )}
        </div>
      )}

      <main className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {hiddenCount > 0 && (
          <p className="pb-1 text-center text-xs text-neutral-600">
            更早的 {hiddenCount} 条仍保存在本地
          </p>
        )}

        {visibleMessages.map((message, index) => (
          <Bubble key={`${message.ts}-${index}`} role={message.role} content={message.content} />
        ))}

        {isGenerating && <Bubble role="assistant" content={draft} pending />}

        {error !== null && (
          <p className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>
        )}
      </main>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="flex gap-2 border-t border-neutral-800 px-4 py-3"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="说点什么…"
          className="flex-1 rounded-md bg-neutral-900 px-3 py-2 text-sm outline-none placeholder:text-neutral-600 focus:ring-1 focus:ring-neutral-700"
        />
        <button
          type="submit"
          disabled={isGenerating || input.trim() === ''}
          className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-40"
        >
          发送
        </button>
      </form>
    </>
  )
}

interface BubbleProps {
  role: Speaker
  content: string
  pending?: boolean
}

function Bubble({ role, content, pending = false }: BubbleProps) {
  const isUser = role === 'user'

  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={[
          'max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed',
          isUser ? 'bg-neutral-100 text-neutral-900' : 'bg-neutral-800 text-neutral-100',
        ].join(' ')}
      >
        {content === '' && pending ? <span className="text-neutral-500">…</span> : content}
      </div>
    </div>
  )
}
