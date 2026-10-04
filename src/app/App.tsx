import { useMemo, useState } from 'react'
import { createServices } from '../composition/root'
import { normalizeChatConfig, type ChatConfig } from '../core/llm/config'
import type { Persona } from '../core/persona/types'
import { DEFAULT_STRATEGY, normalizeStrategy, type StrategyProfile } from '../core/strategy/types'
import { ChatPage } from '../features/chat/ChatPage'
import { loadPersona, savePersona } from '../features/persona/personaStorage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { loadChatConfig, saveChatConfig } from '../features/settings/chatConfigStorage'
import { loadStrategy, saveStrategy } from '../features/settings/strategyStorage'

type View = 'chat' | 'settings'

/**
 * 应用外壳：只有对话与设置两个视图。
 *
 * 人设原本是独立一页，现已并入设置的「人设」分类——配置入口收成一个，
 * 对话页头部不需要再摆两个按钮。
 */
export function App() {
  const [chatConfig, setChatConfig] = useState<ChatConfig>(() => loadChatConfig())
  // 连接配置变化时重建服务：设置页与对话页互斥，不会打断进行中的对话
  const services = useMemo(() => createServices(chatConfig), [chatConfig])
  const [persona, setPersona] = useState<Persona>(() => loadPersona())
  const [strategy, setStrategy] = useState<StrategyProfile>(() => loadStrategy())
  const [view, setView] = useState<View>('chat')

  /** 人设即时生效：改一个字符就回写，与旋钮、连接配置一致，不再有"保存"仪式 */
  const handleChangePersona = (next: Persona) => {
    setPersona(next)
    savePersona(next)
  }

  /** 连接配置即时生效：规范化后同时更新内存与本地存储 */
  const handleChangeChatConfig = (next: ChatConfig) => {
    const normalized = normalizeChatConfig(next)
    setChatConfig(normalized)
    saveChatConfig(normalized)
  }

  /** 旋钮即时生效：规范化后同时更新内存与本地存储 */
  const handleChangeStrategy = (next: StrategyProfile) => {
    const normalized = normalizeStrategy(next)
    setStrategy(normalized)
    saveStrategy(normalized)
  }

  /*
    外壳必须是**确定高度**并裁掉溢出：`min-h-dvh` 只给下限，内容一长就把整页撑高，
    于是中间的滚动容器不再内部滚动、底部输入栏被顶出屏幕（实测输入栏底边落在 926px、
    视口只有 844px）。改成 h-dvh + overflow-hidden 后，中段自己滚、底栏常驻。
  */
  return (
    <div className="app-canvas mx-auto flex h-dvh max-w-2xl flex-col overflow-hidden text-text">
      {view === 'chat' && (
        <ChatPage
          services={services}
          persona={persona}
          strategy={strategy}
          onOpenSettings={() => setView('settings')}
        />
      )}
      {view === 'settings' && (
        <SettingsPage
          services={services}
          strategy={strategy}
          chatConfig={chatConfig}
          persona={persona}
          onChangePersona={handleChangePersona}
          onChangeStrategy={handleChangeStrategy}
          onChangeChatConfig={handleChangeChatConfig}
          onReset={() => handleChangeStrategy(DEFAULT_STRATEGY)}
          onBack={() => setView('chat')}
        />
      )}
    </div>
  )
}
