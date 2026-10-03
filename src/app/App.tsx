import { useMemo, useState } from 'react'
import { createServices } from '../composition/root'
import type { Persona } from '../core/persona/types'
import { DEFAULT_STRATEGY, normalizeStrategy, type StrategyProfile } from '../core/strategy/types'
import { ChatPage } from '../features/chat/ChatPage'
import { PersonaPage } from '../features/persona/PersonaPage'
import { loadPersona, savePersona } from '../features/persona/personaStorage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { loadStrategy, saveStrategy } from '../features/settings/strategyStorage'

type View = 'chat' | 'persona' | 'settings'

export function App() {
  const services = useMemo(() => createServices(), [])
  const [persona, setPersona] = useState<Persona>(() => loadPersona())
  const [strategy, setStrategy] = useState<StrategyProfile>(() => loadStrategy())
  const [view, setView] = useState<View>('chat')

  const handleSavePersona = (next: Persona) => {
    setPersona(next)
    savePersona(next)
    setView('chat')
  }

  /** 旋钮即时生效：规范化后同时更新内存与本地存储 */
  const handleChangeStrategy = (next: StrategyProfile) => {
    const normalized = normalizeStrategy(next)
    setStrategy(normalized)
    saveStrategy(normalized)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-neutral-950 text-neutral-100">
      {view === 'chat' && (
        <ChatPage
          services={services}
          persona={persona}
          strategy={strategy}
          onOpenPersona={() => setView('persona')}
          onOpenSettings={() => setView('settings')}
        />
      )}
      {view === 'persona' && (
        <PersonaPage
          persona={persona}
          onSave={handleSavePersona}
          onCancel={() => setView('chat')}
        />
      )}
      {view === 'settings' && (
        <SettingsPage
          strategy={strategy}
          onChange={handleChangeStrategy}
          onReset={() => handleChangeStrategy(DEFAULT_STRATEGY)}
          onBack={() => setView('chat')}
        />
      )}
    </div>
  )
}
