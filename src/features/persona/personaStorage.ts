import { DEFAULT_PERSONA, EMPTY_PERSONA, type Persona } from '../../core/persona/types'

const STORAGE_KEY = 'regret.persona'

/** 读取人设。localStorage 属于不可信边界：首次进入给默认人设，数据损坏时退回空人设。 */
export function loadPersona(): Persona {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { ...DEFAULT_PERSONA }

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...EMPTY_PERSONA }

    return {
      name: readField(parsed, 'name'),
      userAddress: readField(parsed, 'userAddress'),
      personality: readField(parsed, 'personality'),
      background: readField(parsed, 'background'),
    }
  } catch {
    return { ...EMPTY_PERSONA }
  }
}

export function savePersona(persona: Persona): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persona))
}

function readField(source: object, key: string): string {
  const value = (source as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}
