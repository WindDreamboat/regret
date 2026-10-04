import { useState } from 'react'
import type { AppServices } from '../../composition/root'
import {
  DEFAULT_DIRECT_MODEL,
  resolveDirectEndpoint,
  type ChatConfig,
  type ChatProviderKind,
} from '../../core/llm/config'
import type { Persona } from '../../core/persona/types'
import { CHALLENGE_MIN, DEFAULT_STRATEGY, type StrategyProfile } from '../../core/strategy/types'
import { PersonaPanel } from '../persona/PersonaPanel'
import { clearConversation, downloadMemoryExport, resetToFactory } from './dataManagement'

export interface SettingsPageProps {
  services: AppServices
  strategy: StrategyProfile
  chatConfig: ChatConfig
  persona: Persona
  /** 即时生效：改一个字符就回写，无保存按钮 */
  onChangePersona: (persona: Persona) => void
  /** 即时生效：滑块一变就回写，无保存按钮 */
  onChangeStrategy: (strategy: StrategyProfile) => void
  /** 即时生效：改一个字符就回写，无保存按钮 */
  onChangeChatConfig: (chatConfig: ChatConfig) => void
  onReset: () => void
  onBack: () => void
}

/**
 * 设置分类。
 *
 * 原先是一长条（旋钮 → 连接 → 数据），加上人设后会更长；现在按"你要改的是什么"切成四类，
 * 每次只呈现一类，进入即生效——设置页没有"保存"仪式。
 */
type Category = 'persona' | 'voice' | 'connection' | 'data'

const CATEGORIES: readonly { key: Category; label: string }[] = [
  { key: 'persona', label: '人设' },
  { key: 'voice', label: '说话方式' },
  { key: 'connection', label: '连接' },
  { key: 'data', label: '数据' },
]

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

/**
 * 直连地址被补过路径时，把「实际请求地址」说清楚。
 *
 * 补路径发生在请求那一刻，界面上不显示的话，用户看到的就是一条状态码（真机上出现过
 * 「接口返回 307」：他填的是网关地址，厂商把它重定向到了别处），无从改起。
 */
function endpointHint(draft: string): string | undefined {
  const resolved = resolveDirectEndpoint(draft)
  if (resolved === '' || resolved === draft.trim().replace(/\/+$/, '')) return undefined
  return `实际请求：${resolved}`
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
  persona,
  onChangePersona,
  onChangeStrategy,
  onChangeChatConfig,
  onReset,
  onBack,
}: SettingsPageProps) {
  const [category, setCategory] = useState<Category>('persona')
  const [dataError, setDataError] = useState<string | null>(null)
  // 直连与走代理的字段含义不同（接口地址 vs 代理地址、模型名必填 vs 可留空），文案随之切换
  const direct = chatConfig.provider === 'direct'

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
      <header className="safe-top px-5 pb-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[1.0625rem] font-medium tracking-[0.01em] text-text">设置</h1>
          <button
            type="button"
            onClick={onBack}
            className="-mr-2 rounded-full px-3 py-2 text-sm text-muted transition-colors duration-150 hover:text-accent-text active:bg-surface"
          >
            返回
          </button>
        </div>
      </header>

      <div className="border-b border-line px-4">
        <div role="tablist" aria-label="设置分类" className="scroll-slim flex gap-1 overflow-x-auto">
          {CATEGORIES.map((item) => {
            const active = category === item.key
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(item.key)}
                className={[
                  'relative shrink-0 px-3 pb-3 pt-1 text-sm transition-colors duration-150',
                  active ? 'text-text' : 'text-faint hover:text-muted',
                ].join(' ')}
              >
                {item.label}
                {active && (
                  <span
                    aria-hidden
                    className="tab-underline absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        aria-label={CATEGORIES.find((item) => item.key === category)?.label}
        className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-5"
      >
        {category === 'persona' && <PersonaPanel persona={persona} onChange={onChangePersona} />}

        {category === 'voice' && (
          <div className="space-y-6">
            <p className="text-xs leading-relaxed text-faint">
              这些旋钮决定她怎么说话，拖动即生效。
            </p>

            {KNOBS.map((knob) => {
              const value = strategy[knob.key]
              const min = knob.key === 'challenge' ? CHALLENGE_MIN : 0
              return (
                <div key={knob.key}>
                  <div className="mb-2.5 flex items-baseline justify-between gap-3">
                    <label htmlFor={`strategy-${knob.key}`} className="text-sm text-text">
                      {knob.label}
                    </label>
                    <span className="text-xs tabular-nums text-faint">
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
                    onChange={(event) => onChangeStrategy({ ...strategy, [knob.key]: Number(event.target.value) })}
                    className="range w-full"
                  />
                  <p className="mt-2 text-xs leading-relaxed text-faint">{knob.hint}</p>
                </div>
              )
            })}

            <div className="border-t border-line pt-5">
              <button
                type="button"
                onClick={onReset}
                className="w-full rounded-full py-2.5 text-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-text"
              >
                恢复默认
              </button>
            </div>
          </div>
        )}

        {category === 'connection' && (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-faint">
              在这里填就不必改程序里的配置文件。密钥只保存在这台设备，不会写进安装包。
            </p>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium tracking-wide text-muted">对话服务</span>
              <select
                value={chatConfig.provider}
                onChange={(event) =>
                  patchChatConfig({ provider: event.target.value as ChatProviderKind })
                }
                className="field px-3.5 py-2.5 text-sm"
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
                  ? (endpointHint(draft.endpoint) ??
                    '厂商的完整接口地址；只填到网关也可以，缺的路径会自动补上')
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
        )}

        {category === 'data' && (
          <div className="space-y-5">
            <p className="text-xs leading-relaxed text-faint">
              备份带得走，也能随时清干净。所有内容都只留在这台设备上。
            </p>

            <button
              type="button"
              onClick={() => void runDataAction(() => downloadMemoryExport(services))}
              className="w-full rounded-full border border-line-strong py-2.5 text-sm text-text transition-colors duration-150 hover:border-accent-line hover:bg-accent-soft"
            >
              导出记忆备份
            </button>

            {/* 危险操作排成列表行：与上面的主操作按钮拉开层级，也避免"处处圆角卡片" */}
            <div className="border-t border-line">
              <DangerRow
                label="清除对话与记忆"
                hint="将删除全部对话、记住的事实、关系与摘要，人设和说话方式保留。"
                confirmLabel="确认清除"
                onConfirm={() => runDataAction(() => clearConversation(services))}
              />
              <DangerRow
                label="恢复出厂设置"
                hint="将删除全部数据，包括人设和说话方式，回到最初的样子。"
                confirmLabel="确认恢复"
                onConfirm={() => runDataAction(() => resetToFactory(services))}
              />
            </div>

            {dataError !== null && (
              <p className="rounded-2xl border border-danger-line bg-danger-soft px-4 py-3 text-xs leading-relaxed text-danger-text">
                {dataError}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}

interface DangerRowProps {
  label: string
  hint: string
  confirmLabel: string
  onConfirm: () => void
}

/** 危险操作就地二次确认，避免用 window.confirm（暗色界面与自动化都不友好） */
function DangerRow({ label, hint, confirmLabel, onConfirm }: DangerRowProps) {
  const [armed, setArmed] = useState(false)

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="w-full border-t border-line py-3.5 text-left text-sm text-danger-text transition-colors duration-150 first:border-t-0 hover:bg-danger-soft"
      >
        {label}
      </button>
    )
  }

  return (
    <div className="my-1 rounded-2xl border border-danger-line bg-danger-soft px-4 py-3.5">
      <p className="text-xs leading-relaxed text-danger-text">{hint}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 rounded-full bg-danger py-2 text-sm font-medium text-accent-ink"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="flex-1 rounded-full border border-line-strong py-2 text-sm text-text"
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
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-muted">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        className="field px-3.5 py-2.5 text-sm"
      />
      {hint !== undefined && (
        <span className="mt-1.5 block text-xs leading-relaxed text-faint">{hint}</span>
      )}
    </label>
  )
}
