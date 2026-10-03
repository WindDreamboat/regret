import { useState } from 'react'
import type { AppServices } from '../../composition/root'
import { CHALLENGE_MIN, DEFAULT_STRATEGY, type StrategyProfile } from '../../core/strategy/types'
import { clearConversation, downloadMemoryExport, resetToFactory } from './dataManagement'

export interface SettingsPageProps {
  services: AppServices
  strategy: StrategyProfile
  /** 即时生效：滑块一变就回写，无保存按钮 */
  onChange: (strategy: StrategyProfile) => void
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

export function SettingsPage({ services, strategy, onChange, onReset, onBack }: SettingsPageProps) {
  const [dataError, setDataError] = useState<string | null>(null)

  const update = (key: keyof StrategyProfile, value: number) => {
    onChange({ ...strategy, [key]: value })
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
