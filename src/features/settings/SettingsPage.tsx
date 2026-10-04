import { useState } from 'react'
import type { AppServices } from '../../composition/root'
import type { ChatConfig, ChatProviderKind } from '../../core/llm/config'
import { CHALLENGE_MIN, DEFAULT_STRATEGY, type StrategyProfile } from '../../core/strategy/types'
import { clearConversation, downloadMemoryExport, resetToFactory } from './dataManagement'

export interface SettingsPageProps {
  services: AppServices
  strategy: StrategyProfile
  chatConfig: ChatConfig
  /** 即时生效：滑块一变就回写，无保存按钮 */
  onChange: (strategy: StrategyProfile) => void
  /** 即时生效：改一个字符就回写，无保存按钮 */
  onChangeChatConfig: (chatConfig: ChatConfig) => void
  onReset: () => void
  onBack: () => void
}

interface KnobSpec {
  key: keyof StrategyProfile
  label: string
  hint: string
}

const KNOBS: readonly KnobSpec[] = [
  { key: 'proactivity', label: '主动程度', hint: '她主动找你搭话的意愿' },
  { key: 'empathyDensity', label: '共情表达', hint: '她回应你情绪时的关心程度' },
  { key: 'humor', label: '幽默感', hint: '她开玩笑和调侃的多少' },
  { key: 'pace', label: '关系推进', hint: '从初识到亲近的推进速度' },
  { key: 'verbosity', label: '说话长度', hint: '她每次回复的详细程度' },
  { key: 'challenge', label: '不同意见', hint: '遇到分歧时她表达异议的倾向' },
]

/** 三档人话提示；界面不暴露参数名与数值 */
function bandOf(value: number, base: number): string {
  if (value < base) return '偏低'
  if (value > base) return '偏高'
  return '默认'
}

export function SettingsPage({
  services,
  strategy,
  chatConfig,
  onChange,
  onChangeChatConfig,
  onReset,
  onBack,
}: SettingsPageProps) {
  const [dataError, setDataError] = useState<string | null>(null)

  const update = (key: keyof StrategyProfile, value: number) => {
    onChange({ ...strategy, [key]: value })
  }

  const patchChatConfig = (patch: Partial<ChatConfig>) => {
    onChangeChatConfig({ ...chatConfig, ...patch })
  }

  const runDataAction = async (action: () => Promise<void>) => {
    setDataError(null)
    try {
      await action()
    } catch (cause) {
      setDataError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <>
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h1 className="text-base font-medium">设置</h1>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          返回
        </button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
        <p className="text-xs text-neutral-500">
          调整她的说话方式，改动立即生效。想回到最初的样子，点最下面的「恢复默认」。
        </p>

        {KNOBS.map((knob) => {
          const value = strategy[knob.key]
          const min = knob.key === 'challenge' ? CHALLENGE_MIN : 0
          return (
            <div key={knob.key}>
              <div className="mb-1 flex items-baseline justify-between">
                <label htmlFor={`strategy-${knob.key}`} className="text-sm text-neutral-300">
                  {knob.label}
                </label>
                <span className="text-xs text-neutral-500">
                  {bandOf(value, DEFAULT_STRATEGY[knob.key])}
                </span>
              </div>
              <input
                id={`strategy-${knob.key}`}
                type="range"
                min={min}
                max={1}
                step={0.05}
                value={value}
                onChange={(event) => update(knob.key, Number(event.target.value))}
                className="w-full accent-neutral-100"
              />
              <p className="mt-1 text-xs text-neutral-600">{knob.hint}</p>
            </div>
          )
        })}

        <div className="border-t border-neutral-800 pt-5">
          <h2 className="text-sm text-neutral-300">连接</h2>
          <p className="mt-1 text-xs text-neutral-500">
            在这里填就不必改程序里的配置文件。留空的项由你的代理兜底；密钥只保存在这台设备，只会发给你的代理。
          </p>

          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="text-sm text-neutral-300">对话服务</span>
              <select
                value={chatConfig.provider}
                onChange={(event) =>
                  patchChatConfig({ provider: event.target.value as ChatProviderKind })
                }
                className="mt-1 w-full rounded-md bg-neutral-900 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-neutral-700"
              >
                <option value="mock">演示模式（本地回声）</option>
                <option value="deepseek">真实模型</option>
              </select>
            </label>

            <ConfigField
              label="代理地址"
              value={chatConfig.endpoint}
              placeholder="https://your-proxy.example.com/api/chat"
              hint="选真实模型时要填；打包成 App 后不能留空"
              onChange={(value) => patchChatConfig({ endpoint: value })}
            />
            <ConfigField
              label="API Key"
              type="password"
              value={chatConfig.apiKey}
              placeholder="留空则用代理里的密钥"
              onChange={(value) => patchChatConfig({ apiKey: value })}
            />
            <ConfigField
              label="网关地址"
              value={chatConfig.baseUrl}
              placeholder="https://api.deepseek.com"
              hint="留空则用代理里的默认网关"
              onChange={(value) => patchChatConfig({ baseUrl: value })}
            />
            <ConfigField
              label="模型名"
              value={chatConfig.model}
              placeholder="deepseek-flash"
              hint="留空则用代理里的默认模型"
              onChange={(value) => patchChatConfig({ model: value })}
            />
          </div>
        </div>

        <div className="border-t border-neutral-800 pt-5">
          <h2 className="text-sm text-neutral-300">数据</h2>
          <p className="mt-1 text-xs text-neutral-500">
            备份带得走，也能随时清干净。所有内容都只留在这台设备上。
          </p>

          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={() => void runDataAction(() => downloadMemoryExport(services))}
              className="w-full rounded-md border border-neutral-800 py-2 text-sm text-neutral-300 hover:bg-neutral-900"
            >
              导出记忆备份
            </button>

            <DestructiveRow
              label="清除对话与记忆"
              hint="将删除全部对话、记住的事实、关系与摘要，人设和说话方式保留。"
              confirmLabel="确认清除"
              onConfirm={() => runDataAction(() => clearConversation(services))}
            />

            <DestructiveRow
              label="恢复出厂设置"
              hint="将删除全部数据，包括人设和说话方式，回到最初的样子。"
              confirmLabel="确认恢复"
              onConfirm={() => runDataAction(() => resetToFactory(services))}
            />

            {dataError !== null && (
              <p className="rounded-md bg-red-950 px-3 py-2 text-xs text-red-300">{dataError}</p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-neutral-800 px-4 py-3">
        <button
          type="button"
          onClick={onReset}
          className="w-full rounded-md border border-neutral-800 py-2 text-sm text-neutral-300 hover:bg-neutral-900"
        >
          恢复默认
        </button>
      </div>
    </>
  )
}

interface DestructiveRowProps {
  label: string
  hint: string
  confirmLabel: string
  onConfirm: () => void
}

/** 危险操作就地二次确认，避免用 window.confirm（暗色界面与自动化都不友好） */
function DestructiveRow({ label, hint, confirmLabel, onConfirm }: DestructiveRowProps) {
  const [armed, setArmed] = useState(false)

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="w-full rounded-md border border-red-950 py-2 text-sm text-red-300 hover:bg-red-950/40"
      >
        {label}
      </button>
    )
  }

  return (
    <div className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2">
      <p className="text-xs text-red-300">{hint}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 rounded-md bg-red-900 py-1.5 text-sm text-red-100"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="flex-1 rounded-md border border-neutral-700 py-1.5 text-sm text-neutral-300"
        >
          取消
        </button>
      </div>
    </div>
  )
}

interface ConfigFieldProps {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  type?: 'text' | 'password'
  hint?: string
}

/** 连接配置的单个输入项：标签 + 输入框（可选说明）；改动即回写，无保存按钮。 */
function ConfigField({
  label,
  value,
  placeholder,
  onChange,
  type = 'text',
  hint,
}: ConfigFieldProps) {
  return (
    <label className="block">
      <span className="text-sm text-neutral-300">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        className="mt-1 w-full rounded-md bg-neutral-900 px-3 py-2 text-sm outline-none placeholder:text-neutral-600 focus:ring-1 focus:ring-neutral-700"
      />
      {hint !== undefined && <span className="mt-1 block text-xs text-neutral-600">{hint}</span>}
    </label>
  )
}
