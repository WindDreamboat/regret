import { useEffect, useMemo, useState } from 'react'
import { applyTheme, watchSystemTheme } from './theme'
import { createServices } from '../composition/root'
import { normalizeChatConfig, type ChatConfig } from '../core/llm/config'
import type { Persona } from '../core/persona/types'
import { DEFAULT_STRATEGY, normalizeStrategy, type StrategyProfile } from '../core/strategy/types'
import { normalizeTheme, type ThemePreference } from '../core/theme'
import { ChatPage } from '../features/chat/ChatPage'
import { loadPersona, savePersona } from '../features/persona/personaStorage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { loadChatConfig, saveChatConfig } from '../features/settings/chatConfigStorage'
import { loadStrategy, saveStrategy } from '../features/settings/strategyStorage'
import { loadTheme, saveTheme } from '../features/settings/themeStorage'

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
  const [theme, setTheme] = useState<ThemePreference>(() => loadTheme())
  const [view, setView] = useState<View>('chat')

  /**
   * 主题即时生效：写 `<html data-theme>`、浏览器主题色与 Android 状态栏。
   *
   * 首屏不依赖这里——index.html 的内联脚本已在样式生效前把属性写好（否则冷启动会闪一下），
   * 这一段负责的是"切换"与"系统明暗变了"这两件事。
   */
  useEffect(() => {
    applyTheme(theme)
    // 只有「跟随系统」才需要盯着系统；钉死明暗时系统怎么变都与我们无关
    if (theme !== 'system') return
    return watchSystemTheme(() => applyTheme('system'))
  }, [theme])

  /** 主题偏好即时生效：点一下即换并落盘，与其余配置一致 */
  const handleChangeTheme = (next: ThemePreference) => {
    const normalized = normalizeTheme(next)
    setTheme(normalized)
    saveTheme(normalized)
  }

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
          theme={theme}
          onChangeTheme={handleChangeTheme}
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
