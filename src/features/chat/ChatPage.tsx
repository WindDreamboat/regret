import { useState } from 'react'
import type { AppServices } from '../../composition/root'
import type { Speaker } from '../../core/llm/protocol'
import type { Persona } from '../../core/persona/types'
import { useChat } from './useChat'

export interface ChatPageProps {
  services: AppServices
  persona: Persona
  onOpenPersona: () => void
}

export function ChatPage({ services, persona, onOpenPersona }: ChatPageProps) {
  const { messages, draft, isGenerating, error, send } = useChat(services, persona)
  const [input, setInput] = useState('')

  const submit = () => {
    const text = input
    setInput('')
    void send(text)
  }

  return (
    <>
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h1 className="text-base font-medium">
          {persona.name.trim() === '' ? '虚拟伴侣' : persona.name}
        </h1>
        <button
          type="button"
          onClick={onOpenPersona}
          className="rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          人设
        </button>
      </header>

      <main className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !isGenerating && (
          <p className="mt-8 text-center text-sm text-neutral-500">还没有对话，先打个招呼吧</p>
        )}

        {messages.map((message, index) => (
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
