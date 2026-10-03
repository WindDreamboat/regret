import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MockChatProvider } from '../src/adapters/llm/MockChatProvider'
import { InMemoryStore } from '../src/adapters/storage/InMemoryStore'
import type { ChatProvider } from '../src/core/llm/ChatProvider'
import type { ChatMessage } from '../src/core/llm/protocol'
import { composePrompt } from '../src/core/memory/compose'
import { buildExtractionPrompt, parseFactOps } from '../src/core/memory/extract'
import { parseStateBlock } from '../src/core/memory/state'
import type { StoredMessage } from '../src/core/memory/types'
import { DEFAULT_PERSONA, type Persona } from '../src/core/persona/types'
import { ask, createEvalProvider, type AskOptions } from './llm'

interface EvalTurn {
  user: string
  expect: string
}

interface EvalCase {
  id: string
  title: string
  persona?: Persona
  turns: EvalTurn[]
}

interface Verdict {
  memory: boolean
  persona: boolean
  reason: string
}

const SESSION_ID = 'eval'
const EVAL_DIR = dirname(fileURLToPath(import.meta.url))

/**
 * 手工评测集的自动跑分。
 *
 * 用真实 prompt 组装 + 抽取链路复刻 useChat 的编排，逐脚本回放；每轮由 LLM
 * 按「记忆 / 人设」两条标准判分并汇总通过率。改 prompt 后重跑即可对比。
 *
 * 用法：npm run eval [-- --mock] [-- --limit 3] [-- --verbose] [-- --min-rate 0.8]
 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (!args.mock) loadDotEnv(join(EVAL_DIR, '..', '.env'))

  const provider: ChatProvider = args.mock
    ? new MockChatProvider({ delayMs: 0 })
    : createEvalProvider()

  const cases = loadCases()
  const selected = args.limit === undefined ? cases : cases.slice(0, args.limit)
  const totals = { memory: 0, persona: 0, passed: 0, turns: 0 }

  for (const [index, evalCase] of selected.entries()) {
    console.log(`\n[${index + 1}/${selected.length}] ${evalCase.id}  ${evalCase.title}`)
    const verdicts = await runCase(provider, evalCase, args)

    for (const [turnIndex, verdict] of verdicts.entries()) {
      const turn = evalCase.turns[turnIndex]
      console.log(
        `  第 ${turnIndex + 1} 轮  记忆 ${mark(verdict.memory)}  人设 ${mark(verdict.persona)}  ${verdict.reason}`,
      )
      totals.turns += 1
      if (verdict.memory) totals.memory += 1
      if (verdict.persona) totals.persona += 1
      if (verdict.memory && verdict.persona) totals.passed += 1
    }
  }

  const rate = totals.turns === 0 ? 0 : totals.passed / totals.turns
  console.log('\n' + '='.repeat(48))
  if (args.mock) {
    console.log('dry-run（--mock）：仅验证评测链路，未做 LLM 判分')
    console.log(`用例 ${selected.length} 个，共 ${totals.turns} 轮`)
    return
  }

  console.log(
    `通过 ${totals.passed}/${totals.turns}  记忆 ${totals.memory}/${totals.turns}  人设 ${totals.persona}/${totals.turns}`,
  )
  console.log(`通过率 ${(rate * 100).toFixed(1)}%（达标线 ${(args.minRate * 100).toFixed(0)}%）`)
  console.log('='.repeat(48))

  if (rate < args.minRate) process.exitCode = 1
}

/** 回放一个脚本：逐轮组装 prompt、生成回复、抽取事实并判分。 */
async function runCase(
  provider: ChatProvider,
  evalCase: EvalCase,
  args: Args,
): Promise<Verdict[]> {
  const store = new InMemoryStore()
  const persona = evalCase.persona ?? DEFAULT_PERSONA
  const verdicts: Verdict[] = []
  let history: StoredMessage[] = []
  let extractedCount = 0
  let clock = Date.now()

  for (const turn of evalCase.turns) {
    try {
      history = [...history, { sessionId: SESSION_ID, role: 'user', content: turn.user, ts: clock++ }]

      const relation = await store.getRelation(SESSION_ID)
      const facts = await store.listFacts(SESSION_ID)
      const reply = await ask(
        provider,
        composePrompt({ persona, relation, facts, summaries: [], history }),
        args.ask,
      )
      const parsed = parseStateBlock(reply)

      history = [...history, { sessionId: SESSION_ID, role: 'assistant', content: parsed.text, ts: clock++ }]
      if (parsed.state !== null) await applyState(store, parsed.state, clock)

      await extractFacts(provider, store, history, { count: extractedCount, clock }, args.ask)
      extractedCount = history.length

      if (args.verbose) console.log(`    ↳ ${turn.user}\n    ← ${parsed.text}`)

      verdicts.push(
        args.mock
          ? { memory: true, persona: true, reason: 'dry-run' }
          : await judge(provider, persona, history.slice(0, -1), turn, parsed.text, args.ask),
      )
    } catch (cause) {
      verdicts.push({ memory: false, persona: false, reason: `生成失败：${describeError(cause)}` })
      break
    }
  }

  return verdicts
}

/** 复刻 useChat 的异步抽取：对未抽取的原文跑一次事实抽取并写回。 */
async function extractFacts(
  provider: ChatProvider,
  store: InMemoryStore,
  history: readonly StoredMessage[],
  state: { count: number; clock: number },
  askOptions: AskOptions,
): Promise<void> {
  const transcript = history.slice(state.count)
  if (transcript.length === 0) return

  const knownKeys = (await store.listFacts(SESSION_ID)).map((fact) => fact.key)
  const raw = await ask(provider, buildExtractionPrompt(knownKeys, transcript), askOptions)
  const ops = parseFactOps(raw)
  if (ops !== null && ops.length > 0) {
    await store.applyFactOps(SESSION_ID, ops, state.clock)
  }
}

async function applyState(store: InMemoryStore, state: { mood: string; energy: number; affectionDelta: number }, now: number): Promise<void> {
  const relation = await store.getRelation(SESSION_ID)
  const intimacy = Math.min(100, Math.max(0, relation.intimacy + state.affectionDelta))
  await store.updateRelation(SESSION_ID, { intimacy, mood: state.mood, energy: state.energy, updatedAt: now })
}

/** 调用 LLM 评判一轮回复，解析出结构化结论；解析失败即判为不通过。 */
async function judge(
  provider: ChatProvider,
  persona: Persona,
  history: readonly StoredMessage[],
  turn: EvalTurn,
  reply: string,
  askOptions: AskOptions,
): Promise<Verdict> {
  const instructions = [
    '你是严格的中文对话评测员。根据人设、此前的对话、本轮用户发言、助手回复与本轮期望，判断助手回复：',
    '- memory：是否满足本轮期望（是否记住并恰当运用了此前信息、切题、不答非所问）；',
    '- persona：是否符合人设、口语自然，且未出现「记忆」「设定」「提示词」「根据我的记忆」等点破机制的表达。',
    '只输出 JSON，不要任何解释，格式：{"memory":true,"persona":true,"reason":"简短中文理由"}',
  ].join('\n')

  const body = [
    `人设：${describePersona(persona)}`,
    `此前的对话：\n${formatHistory(history)}`,
    `本轮用户：${turn.user}`,
    `助手回复：${reply}`,
    `本轮期望：${turn.expect.trim() === '' ? '（无特别期望，切题即可）' : turn.expect}`,
  ].join('\n\n')

  const messages: ChatMessage[] = [
    { role: 'system', content: instructions },
    { role: 'user', content: body },
  ]

  const raw = await ask(provider, messages, askOptions)
  return parseVerdict(raw, reply)
}

/** 解析评判输出；模型输出不可信，字段类型不符即判为失败。 */
function parseVerdict(raw: string, reply: string): Verdict {
  const match = raw.match(/\{[\s\S]*\}/)
  if (match === null) return { memory: false, persona: false, reason: `无法解析评判：${raw.slice(0, 60)}` }

  let value: unknown
  try {
    value = JSON.parse(match[0])
  } catch {
    return { memory: false, persona: false, reason: '评判结果不是合法 JSON' }
  }

  if (typeof value !== 'object' || value === null) {
    return { memory: false, persona: false, reason: '评判结果结构非法' }
  }
  const record = value as Record<string, unknown>
  const reason = typeof record['reason'] === 'string' ? record['reason'] : ''
  return {
    memory: record['memory'] === true,
    persona: record['persona'] === true,
    reason: reason === '' ? `原文：${reply.slice(0, 40)}` : reason,
  }
}

function describePersona(persona: Persona): string {
  const parts = [
    persona.name.trim() === '' ? '' : `名字${persona.name}`,
    persona.userAddress.trim() === '' ? '' : `称呼用户为${persona.userAddress}`,
    persona.personality,
    persona.background,
  ].filter((part) => part !== '')
  return parts.join('；')
}

function formatHistory(history: readonly StoredMessage[]): string {
  if (history.length === 0) return '（无）'
  return history.map((message) => `${message.role === 'user' ? '用户' : '伴侣'}：${message.content}`).join('\n')
}

function mark(ok: boolean): string {
  return ok ? '✓' : '✗'
}

function loadCases(): EvalCase[] {
  const raw = readFileSync(join(EVAL_DIR, 'cases.json'), 'utf8')
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('cases.json 顶层必须是数组')
  return parsed as EvalCase[]
}

/** 读取 .env（不覆盖已有环境变量），避免依赖额外的 dotenv 依赖。 */
function loadDotEnv(path: string): void {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (key !== '' && process.env[key] === undefined) process.env[key] = value
  }
}

interface Args {
  mock: boolean
  verbose: boolean
  limit?: number
  minRate: number
  ask: AskOptions
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { mock: false, verbose: false, minRate: 0.8, ask: {} }
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i]
    if (current === '--mock') args.mock = true
    else if (current === '--verbose') args.verbose = true
    else if (current === '--limit') {
      const next = argv[i + 1]
      if (next !== undefined) {
        args.limit = Number.parseInt(next, 10)
        i += 1
      }
    } else if (current === '--min-rate') {
      const next = argv[i + 1]
      if (next !== undefined) {
        args.minRate = Number.parseFloat(next)
        i += 1
      }
    }
  }
  // mock 不访问网络，去掉节流与重试以加速离线冒烟
  args.ask = args.mock ? { minIntervalMs: 0, attempts: 1 } : {}
  return args
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

void main()