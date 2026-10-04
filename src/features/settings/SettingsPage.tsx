import { useState, type ReactNode } from 'react'
import type { AppServices } from '../../composition/root'
import {
  DEFAULT_DIRECT_MODEL,
  type ChatConfig,
  type ChatProviderKind,
} from '../../core/llm/config'
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

const FIELD_SKIN =
  'mt-1.5 w-full rounded-xl bg-ink-850 px-3.5 py-2.5 text-sm text-ink-100 outline-none ring-1 ring-inset ring-ink-800 placeholder:text-ink-500 focus:ring-2 focus:ring-accent-600'

/**
 * 草稿没被采纳时说清原因。
 *
 * 地址字段由 `normalizeChatConfig` 把关，非法值会被静默换成空串；若界面照旧显示用户敲的
 * 内容，就会出现「填了却没生效」的哑谜，所以这里把原因顶到提示位上。
 */
function addressWarning(draft: string, saved: string): string | undefined {
  if (draft.trim() === '' || saved !== '') return undefined
  return '这个地址没生效：只能以 http(s):// 或 / 开头'
}

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
  // 直连与走代理的字段含义不同（接口地址 vs 代理地址、模型名必填 vs 可留空），文案随之切换
  const direct = chatConfig.provider === 'direct'

  const update = (key: keyof StrategyProfile, value: number) => {
    onChange({ ...strategy, [key]: value })
  }

  const patchChatConfig = (patch: Partial<ChatConfig>) => {
    onChangeChatConfig({ ...chatConfig, ...patch })
  }

  /**
   * 文本字段的输入草稿。
   *
   * 配置每次变更都会经 `normalizeChatConfig` 规范化，而地址字段只接受 `http(s)://` 或 `/`
   * 开头。若把规范化结果原样回填给受控输入框，用户逐字敲 `https://…` 时，前半截还不合法
   * 的前缀会被当场抹掉——真机实测 `https:` 被吃掉、只剩下 `//…`，等于**手输 URL 根本输不进去**。
   * 因此输入框显示草稿，规范化后的值照旧入库；两者不一致时另行提示。
   *
   * 草稿只在挂载时初始化：改这份配置的只有设置页自己，外部改动（恢复出厂设置）走整页重载。
   */
  const [draft, setDraft] = useState(() => ({
    endpoint: chatConfig.endpoint,
    apiKey: chatConfig.apiKey,
    baseUrl: chatConfig.baseUrl,
    model: chatConfig.model,
  }))

  const patchText = (key: keyof typeof draft, value: string) => {
    setDraft((previous) => ({ ...previous, [key]: value }))
    onChangeChatConfig({ ...chatConfig, [key]: value })
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
      <header className="safe-top flex items-center justify-between gap-3 border-b border-ink-800 px-4 pb-3">
        <h1 className="text-base font-medium tracking-wide">设置</h1>
        <button
          type="button"
          onClick={onBack}
          className="rounded-full px-3 py-1.5 text-sm text-ink-400 transition-colors hover:bg-ink-850 hover:text-accent-200"
        >
          返回
        </button>
      </header>

      <div className="flex-1 space-y-7 overflow-y-auto px-4 py-5">
        <p className="text-xs leading-relaxed text-ink-500">
          调整她的说话方式，改动立即生效。想回到最初的样子，点最下面的「恢复默认」。
        </p>

        {KNOBS.map((knob) => {
          const value = strategy[knob.key]
          const min = knob.key === 'challenge' ? CHALLENGE_MIN : 0
          return (
            <div key={knob.key}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <label htmlFor={`strategy-${knob.key}`} className="text-sm text-ink-200">
                  {knob.label}
                </label>
                <span className="rounded-full border border-ink-800 px-2 py-0.5 text-[11px] leading-5 text-ink-400">
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
                className="h-1.5 w-full accent-accent-500"
              />
              <p className="mt-1.5 text-xs text-ink-500">{knob.hint}</p>
            </div>
          )
        })}

        <div className="border-t border-ink-800 pt-6">
          <SectionTitle>连接</SectionTitle>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            在这里填就不必改程序里的配置文件。密钥只保存在这台设备，不会写进安装包。
          </p>

          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-xs font-medium tracking-wide text-ink-400">对话服务</span>
              <select
                value={chatConfig.provider}
                onChange={(event) =>
                  patchChatConfig({ provider: event.target.value as ChatProviderKind })
                }
                className={FIELD_SKIN}
              >
                <option value="mock">演示模式（本地回声）</option>
                <option value="direct">真实模型（直连厂商）</option>
                <option value="deepseek">真实模型（走自建代理）</option>
              </select>
            </label>

            <ConfigField
              label={direct ? '接口地址' : '代理地址'}
              value={draft.endpoint}
              placeholder={
                direct
                  ? 'https://api.deepseek.com/v1/chat/completions'
                  : 'https://your-proxy.example.com/api/chat'
              }
              hint={
                addressWarning(draft.endpoint, chatConfig.endpoint) ??
                (direct
                  ? '厂商的完整接口地址；厂商不支持跨域时，App 会自动改用系统网络请求'
                  : '选真实模型时要填；打包成 App 后不能留空')
              }
              onChange={(value) => patchText('endpoint', value)}
            />
            <ConfigField
              label="API Key"
              type="password"
              value={draft.apiKey}
              placeholder={direct ? '直连时必须填' : '留空则用代理里的密钥'}
              {...(direct ? { hint: '只发给厂商；保存在这台设备上，请自行留意保管' } : {})}
              onChange={(value) => patchText('apiKey', value)}
            />
            {!direct && (
              <ConfigField
                label="网关地址"
                value={draft.baseUrl}
                placeholder="https://api.deepseek.com"
                hint={addressWarning(draft.baseUrl, chatConfig.baseUrl) ?? '留空则用代理里的默认网关'}
                onChange={(value) => patchText('baseUrl', value)}
              />
            )}
            <ConfigField
              label="模型名"
              value={draft.model}
              placeholder={direct ? DEFAULT_DIRECT_MODEL : 'deepseek-flash'}
              hint={direct ? `留空用 ${DEFAULT_DIRECT_MODEL}` : '留空则用代理里的默认模型'}
              onChange={(value) => patchText('model', value)}
            />
          </div>
        </div>

        <div className="border-t border-ink-800 pt-6">
          <SectionTitle>数据</SectionTitle>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            备份带得走，也能随时清干净。所有内容都只留在这台设备上。
          </p>

          <div className="mt-4 space-y-2.5">
            <button
              type="button"
              onClick={() => void runDataAction(() => downloadMemoryExport(services))}
              className="w-full rounded-full border border-ink-700 py-2.5 text-sm text-ink-200 transition-colors hover:border-accent-700 hover:bg-accent-950 hover:text-accent-200"
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
              <p className="rounded-xl border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-300">
                {dataError}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="safe-bottom border-t border-ink-800 bg-ink-900 px-4 pt-3">
        <button
          type="button"
          onClick={onReset}
          className="w-full rounded-full border border-ink-700 py-2.5 text-sm text-ink-200 transition-colors hover:border-ink-600 hover:bg-ink-850"
        >
          恢复默认
        </button>
      </div>
    </>
  )
}

interface SectionTitleProps {
  children: ReactNode
}

/** 区块标题用一条主色细线做锚点，替代整块卡片——避免「卡片套卡片」。 */
function SectionTitle({ children }: SectionTitleProps) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-medium text-ink-200">
      <span aria-hidden className="h-3.5 w-0.5 rounded-full bg-accent-500" />
      {children}
    </h2>
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
        className="w-full rounded-full border border-red-950 py-2.5 text-sm text-red-300 transition-colors hover:border-red-900 hover:bg-red-950"
      >
        {label}
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-red-900 bg-red-950 px-3.5 py-3">
      <p className="text-xs leading-relaxed text-red-300">{hint}</p>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 rounded-full bg-red-900 py-2 text-sm font-medium text-red-100"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="flex-1 rounded-full border border-ink-700 py-2 text-sm text-ink-200"
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
      <span className="text-xs font-medium tracking-wide text-ink-400">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        className={FIELD_SKIN}
      />
      {hint !== undefined && <span className="mt-1.5 block text-xs text-ink-500">{hint}</span>}
    </label>
  )
}