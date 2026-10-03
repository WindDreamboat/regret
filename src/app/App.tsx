import { useMemo, useState } from 'react'
import { createServices } from '../composition/root'
import type { Persona } from '../core/persona/types'
import { ChatPage } from '../features/chat/ChatPage'
import { PersonaPage } from '../features/persona/PersonaPage'
import { loadPersona, savePersona } from '../features/persona/personaStorage'

type View = 'chat' | 'persona'

export function App() {
  const services = useMemo(() => createServices(), [])
  const [persona, setPersona] = useState<Persona>(() => loadPersona())
  const [view, setView] = useState<View>('chat')

  const handleSavePersona = (next: Persona) => {
    setPersona(next)
    savePersona(next)
    setView('chat')
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-neutral-950 text-neutral-100">
      {view === 'chat' ? (
        <ChatPage
          services={services}
          persona={persona}
          onOpenPersona={() => setView('persona')}
        />
      ) : (
        <PersonaPage
          persona={persona}
          onSave={handleSavePersona}
          onCancel={() => setView('chat')}
        />
      )}
    </div>
  )
}
