import { CHALLENGE_MIN, DEFAULT_STRATEGY, type StrategyProfile } from '../../core/strategy/types'

export interface SettingsPageProps {
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

export function SettingsPage({ strategy, onChange, onReset, onBack }: SettingsPageProps) {
  const update = (key: keyof StrategyProfile, value: number) => {
    onChange({ ...strategy, [key]: value })
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
