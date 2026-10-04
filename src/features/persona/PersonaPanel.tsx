import type { Persona } from '../../core/persona/types'

export interface PersonaPanelProps {
  persona: Persona
  /** 即时生效：改一个字符就回写，与旋钮、连接配置一致，没有"保存"按钮 */
  onChange: (persona: Persona) => void
}

interface FieldSpec {
  key: keyof Persona
  label: string
  placeholder: string
  multiline: boolean
}

const FIELDS: readonly FieldSpec[] = [
  { key: 'name', label: '她的名字', placeholder: '例如：小满', multiline: false },
  { key: 'userAddress', label: '她对你的称呼', placeholder: '例如：阿泽', multiline: false },
  { key: 'personality', label: '性格', placeholder: '例如：温和，爱吐槽，偶尔嘴硬', multiline: true },
  { key: 'background', label: '背景故事', placeholder: '例如：在一家旧书店工作，喜欢雨天', multiline: true },
]

/** 人设表单本体；从独立页面搬进设置的「人设」分类，逻辑不变、只换了容器 */
export function PersonaPanel({ persona, onChange }: PersonaPanelProps) {
  const update = (key: keyof Persona, value: string) => {
    onChange({ ...persona, [key]: value })
  }

  return (
    <div className="space-y-6">
      <p className="text-note leading-relaxed text-faint">
        她是谁、怎么称呼你，都由你定。改动立即生效——下一次开口就是新的她。
      </p>

      {FIELDS.map((field) => (
        <label key={field.key} className="block">
          <span className="group-label block text-note font-medium text-muted">{field.label}</span>
          {field.multiline ? (
            <textarea
              rows={3}
              value={persona[field.key]}
              placeholder={field.placeholder}
              onChange={(event) => update(field.key, event.target.value)}
              className="field-line mt-1 resize-none py-2 text-body"
            />
          ) : (
            <input
              value={persona[field.key]}
              placeholder={field.placeholder}
              onChange={(event) => update(field.key, event.target.value)}
              className="field-line mt-1 py-2.5 text-body"
            />
          )}
        </label>
      ))}
    </div>
  )
}
