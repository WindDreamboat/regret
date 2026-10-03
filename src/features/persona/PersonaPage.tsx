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
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h1 className="text-base font-medium">人设配置</h1>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          取消
        </button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 block text-sm text-neutral-400">{field.label}</span>
            {field.multiline ? (
              <textarea
                rows={3}
                value={draft[field.key]}
                placeholder={field.placeholder}
                onChange={(event) => update(field.key, event.target.value)}
                className="w-full resize-none rounded-md bg-neutral-900 px-3 py-2 text-sm outline-none placeholder:text-neutral-600 focus:ring-1 focus:ring-neutral-700"
              />
            ) : (
              <input
                value={draft[field.key]}
                placeholder={field.placeholder}
                onChange={(event) => update(field.key, event.target.value)}
                className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm outline-none placeholder:text-neutral-600 focus:ring-1 focus:ring-neutral-700"
              />
            )}
          </label>
        ))}
      </div>

      <div className="border-t border-neutral-800 px-4 py-3">
        <button
          type="submit"
          className="w-full rounded-md bg-neutral-100 py-2 text-sm font-medium text-neutral-900"
        >
          保存
        </button>
      </div>
    </form>
  )
}
