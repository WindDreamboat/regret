import { useState, type ReactNode } from 'react'
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
    // 正在生成时不要清空输入框：send 会直接返回，否则用户刚打的字会被无谓清掉
    if (isGenerating) return
    const text = input
    setInput('')
    void send(text)
  }

  const hiddenCount = Math.max(0, messages.length - VISIBLE_MESSAGE_LIMIT)
  const visibleMessages = hiddenCount > 0 ? messages.slice(-VISIBLE_MESSAGE_LIMIT) : messages

  return (
    <>
      <header className="safe-top flex items-center justify-between gap-3 border-b border-ink-800 px-4 pb-3">
        <h1 className="flex items-center gap-2 text-base font-medium tracking-wide">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent-400" />
          {persona.name.trim() === '' ? '虚拟伴侣' : persona.name}
        </h1>
        <div className="flex items-center gap-1">
          <HeaderButton onClick={onOpenPersona}>人设</HeaderButton>
          <HeaderButton onClick={onOpenSettings}>设置</HeaderButton>
        </div>
      </header>

      {relation !== null && (
        <div
          data-testid="relation-bar"
          className="flex items-center gap-1.5 border-b border-ink-800 px-4 py-2"
        >
          <Chip tone="accent">{relation.stage}</Chip>
          <Chip>亲密度 {relation.intimacy}</Chip>
          {relation.mood.trim() !== '' && <Chip>{relation.mood}</Chip>}
        </div>
      )}

      <main className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {hiddenCount > 0 && (
          <p className="pb-1 text-center text-xs text-ink-500">
            更早的 {hiddenCount} 条仍保存在本地
          </p>
        )}

        {visibleMessages.map((message, index) => (
          <Bubble key={`${message.ts}-${index}`} role={message.role} content={message.content} />
        ))}

        {isGenerating && (
          <Bubble role="assistant" content={draft} pending testId="pending-bubble" />
        )}

        {error !== null && (
          <p className="rounded-xl border border-accent-900 bg-accent-950 px-3 py-2 text-sm text-accent-200">
            {error}
          </p>
        )}
      </main>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="safe-bottom flex items-end gap-2 border-t border-ink-800 bg-ink-900 px-4 pt-3"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="说点什么…"
          className="min-w-0 flex-1 rounded-full bg-ink-850 px-4 py-2.5 text-sm text-ink-100 outline-none ring-1 ring-inset ring-ink-800 placeholder:text-ink-500 focus:ring-2 focus:ring-accent-600"
        />
        <button
          type="submit"
          disabled={isGenerating || input.trim() === ''}
          className="shrink-0 rounded-full bg-accent-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition-transform duration-150 active:scale-95 disabled:opacity-40"
        >
          发送
        </button>
      </form>
    </>
  )
}

interface HeaderButtonProps {
  onClick: () => void
  children: string
}

/** 头部次级动作：默认安静，悬停时才让主色进来。 */
function HeaderButton({ onClick, children }: HeaderButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-sm text-ink-400 transition-colors hover:bg-ink-850 hover:text-accent-200"
    >
      {children}
    </button>
  )
}

interface ChipProps {
  tone?: 'plain' | 'accent'
  children: ReactNode
}

/** 关系状态用的紧凑标签；主色只留给「阶段」这一个最有信息量的位置。 */
function Chip({ tone = 'plain', children }: ChipProps) {
  const skin =
    tone === 'accent'
      ? 'border-accent-900 bg-accent-950 text-accent-200'
      : 'border-ink-800 bg-ink-900 text-ink-400'

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] leading-5 ${skin}`}>
      {children}
    </span>
  )
}

interface BubbleProps {
  role: Speaker
  content: string
  pending?: boolean
  testId?: string
}

function Bubble({ role, content, pending = false, testId }: BubbleProps) {
  const isUser = role === 'user'

  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'} data-testid={testId}>
      <div
        className={[
          'bubble rise-in max-w-[80%] whitespace-pre-wrap px-3.5 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bubble-from-you bg-accent-900 text-accent-200'
            : 'bubble-from-her bg-ink-850 text-ink-100 ring-1 ring-inset ring-ink-800',
        ].join(' ')}
      >
        {content === '' && pending ? <span className="text-ink-500">…</span> : content}
      </div>
    </div>
  )
}