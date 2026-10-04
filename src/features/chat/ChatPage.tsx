import { useRef, useState } from 'react'
import type { AppServices } from '../../composition/root'
import type { Speaker } from '../../core/llm/protocol'
import type { Persona } from '../../core/persona/types'
import type { StrategyProfile } from '../../core/strategy/types'
import { useChat } from './useChat'
import { usePacedReveal } from './usePacedReveal'
import { useStickToBottom } from './useStickToBottom'

export interface ChatPageProps {
  services: AppServices
  persona: Persona
  strategy: StrategyProfile
  onOpenSettings: () => void
}

/**
 * 只渲染最近若干条消息。
 *
 * 主链路的 prompt 已由 `DEFAULT_MAX_HISTORY` 封顶，但界面对每一条消息都生成气泡，
 * 长对话下 DOM 与每次按键的重渲成本会无限增长。更早的消息仍完整保存在本地。
 */
const VISIBLE_MESSAGE_LIMIT = 60

export function ChatPage({ services, persona, strategy, onOpenSettings }: ChatPageProps) {
  const { messages, relation, draft, isGenerating, error, send } = useChat(services, persona, strategy)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLElement | null>(null)

  // 上游整包返回时把节奏补回来；逐字流时只是跟着走
  const visibleDraft = usePacedReveal(draft, isGenerating)
  useStickToBottom(scrollRef, `${messages.length}:${visibleDraft.length}:${error ?? ''}`)

  const submit = () => {
    // 正在生成时不要清空输入框：send 会直接返回，否则用户刚打的字会被无谓清掉
    if (isGenerating) return
    const text = input
    setInput('')
    void send(text)
  }

  const hiddenCount = Math.max(0, messages.length - VISIBLE_MESSAGE_LIMIT)
  const visibleMessages = hiddenCount > 0 ? messages.slice(-VISIBLE_MESSAGE_LIMIT) : messages
  const name = persona.name.trim() === '' ? '虚拟伴侣' : persona.name

  return (
    <>
      {/* 头部不做 sticky：让名字与关系随对话滚走，屏幕留给内容 */}
      <header className="safe-top px-5 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 truncate text-title font-medium tracking-[-0.01em] text-text">
              <span aria-hidden className="presence" />
              {name}
            </h1>
            {relation !== null && (
              <p
                data-testid="relation-bar"
                className="mt-1.5 text-note leading-5 tabular-nums text-faint"
              >
                <span className="text-accent-text">{relation.stage}</span>
                <Separator />
                亲密度 {relation.intimacy}
                {relation.mood.trim() !== '' && (
                  <>
                    <Separator />
                    {relation.mood}
                  </>
                )}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            className="-mr-2 shrink-0 rounded-full px-3 py-2 text-body text-muted transition-colors duration-150 hover:text-accent-text active:bg-surface"
          >
            设置
          </button>
        </div>
      </header>

      {/*
        min-h-0：flex 子项默认 min-height:auto，不写它就算有 overflow 也不会收缩。

        对话贴着输入栏往上长，而不是从标题下方开始往下堆：短对话时下方一大片空白，
        整页看着像"没写完的文档"（截图确认）。用首个子项的 margin-top:auto 把它顶到底部；
        内容变长后 auto 自动归零，因此不像 justify-content:flex-end 那样会把顶部内容
        挤出可滚区域。
      */}
      <main
        ref={scrollRef}
        className="scroll-slim flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-4"
      >
        {hiddenCount > 0 && (
          <p className="mt-auto pb-3 text-center text-note text-faint">
            更早的 {hiddenCount} 条仍保存在本地
          </p>
        )}

        {visibleMessages.map((message, index) => {
          const previous = visibleMessages[index - 1]
          return (
            <Bubble
              key={`${message.ts}-${index}`}
              role={message.role}
              content={message.content}
              first={previous === undefined || previous.role !== message.role}
              /* 上方那条提示已经在顶着了，第一条气泡就不必再顶一次 */
              anchor={index === 0 && hiddenCount === 0}
            />
          )
        })}

        {isGenerating && (
          <Bubble
            role="assistant"
            content={visibleDraft}
            first={visibleMessages.at(-1)?.role !== 'assistant'}
            pending
            testId="pending-bubble"
          />
        )}

        {error !== null && (
          <p className="mt-3 rounded-2xl border border-danger-line bg-danger-soft px-4 py-3 text-note leading-relaxed text-danger-text">
            {error}
          </p>
        )}
      </main>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="safe-bottom flex items-end gap-2.5 border-t border-line bg-canvas px-4 pt-3"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="说点什么…"
          className="field min-w-0 flex-1 px-4 py-3 text-body leading-5"
        />
        <button
          type="submit"
          aria-label="发送"
          disabled={isGenerating || input.trim() === ''}
          className="mb-px flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition-transform duration-150 ease-[var(--ease-out-quart)] active:scale-95 disabled:opacity-35"
        >
          <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5" fill="none">
            <path
              d="M10 16V4.5M10 4.5 5 9.5M10 4.5l5 5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>
    </>
  )
}

/** 关系行里的分隔符：一个不抢戏的细点 */
function Separator() {
  return (
    <span aria-hidden className="px-1.5 text-line-strong">
      ·
    </span>
  )
}

interface BubbleProps {
  role: Speaker
  content: string
  /** 是否是该说话方这一串消息的第一条；用来做疏密节奏 */
  first: boolean
  pending?: boolean
  testId?: string
  /** 第一条消息额外承担"把整段对话顶到底部"的职责，见 main 里的说明 */
  anchor?: boolean
}

function Bubble({ role, content, first, pending = false, testId, anchor = false }: BubbleProps) {
  const isUser = role === 'user'

  return (
    <div
      className={[
        'flex',
        anchor ? 'mt-auto' : first ? 'mt-4' : 'mt-1',
        isUser ? 'justify-end' : 'justify-start',
      ].join(' ')}
      data-testid={testId}
    >
      <div
        className={[
          'bubble rise-in max-w-[78%] whitespace-pre-wrap px-4 py-2.5 text-body',
          isUser
            ? 'bubble-from-you bg-accent-soft text-text'
            : 'bubble-from-her bg-surface text-text',
        ].join(' ')}
      >
        {content}
        {pending && (content === '' ? <TypingDots /> : <span aria-hidden className="caret" />)}
      </div>
    </div>
  )
}

/**
 * 等第一个字时的呼吸点。
 *
 * 用空元素而不是文字，因此气泡的 textContent 仍是空串——e2e 靠"最终文本的前缀"
 * 判定逐字中间态，任何文字都会污染那个判定。
 */
function TypingDots() {
  return (
    <span aria-hidden className="typing-dots">
      <i />
      <i />
      <i />
    </span>
  )
}
