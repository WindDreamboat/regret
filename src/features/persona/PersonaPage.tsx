import { useState } from 'react'
import type { Persona } from '../../core/persona/types'

export interface PersonaPageProps {
  persona: Persona
  onSave: (persona: Persona) => void
  onCancel: () => void
}

interface FieldSpec {
  key: keyof Persona
  label: string
  placeholder: string
  multiline: boolean
}

const FIELDS: readonly FieldSpec[] = [
  { key: 'name', label: '伴侣的名字', placeholder: '例如：小满', multiline: false },
  { key: 'userAddress', label: '她对你的称呼', placeholder: '例如：阿泽', multiline: false },
  { key: 'personality', label: '性格', placeholder: '例如：温和，爱吐槽，偶尔嘴硬', multiline: true },
  { key: 'background', label: '背景故事', placeholder: '例如：在一家旧书店工作，喜欢雨天', multiline: true },
]

const FIELD_SKIN =
  'w-full rounded-xl bg-ink-850 px-3.5 py-2.5 text-sm text-ink-100 outline-none ring-1 ring-inset ring-ink-800 placeholder:text-ink-500 focus:ring-2 focus:ring-accent-600'

export function PersonaPage({ persona, onSave, onCancel }: PersonaPageProps) {
  const [draft, setDraft] = useState<Persona>(persona)

  const update = (key: keyof Persona, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSave(draft)
      }}
      className="flex flex-1 flex-col"
    >
      <header className="safe-top flex items-center justify-between gap-3 border-b border-ink-800 px-4 pb-3">
        <h1 className="text-base font-medium tracking-wide">人设配置</h1>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-3 py-1.5 text-sm text-ink-400 transition-colors hover:bg-ink-850 hover:text-accent-200"
        >
          取消
        </button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
        <p className="text-xs leading-relaxed text-ink-500">
          她是谁、怎么称呼你，都由你定。改完保存，下一次开口就是新的她。
        </p>

        {FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-ink-400">
              {field.label}
            </span>
            {field.multiline ? (
              <textarea
                rows={3}
                value={draft[field.key]}
                placeholder={field.placeholder}
                onChange={(event) => update(field.key, event.target.value)}
                className={`${FIELD_SKIN} resize-none leading-relaxed`}
              />
            ) : (
              <input
                value={draft[field.key]}
                placeholder={field.placeholder}
                onChange={(event) => update(field.key, event.target.value)}
                className={FIELD_SKIN}
              />
            )}
          </label>
        ))}
      </div>

      <div className="safe-bottom border-t border-ink-800 bg-ink-900 px-4 pt-3">
        <button
          type="submit"
          className="w-full rounded-full bg-accent-500 py-2.5 text-sm font-semibold text-ink-950 transition-transform duration-150 active:scale-[0.98]"
        >
          保存
        </button>
      </div>
    </form>
  )
}