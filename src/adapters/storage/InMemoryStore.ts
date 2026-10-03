import type { MemoryStore } from '../../core/memory/MemoryStore'
import { applyFactOps as mergeFactOps } from '../../core/memory/extract'
import type { Fact, FactOp, Relation, StoredMessage, Summary } from '../../core/memory/types'
import { createDefaultRelation } from '../../core/memory/types'

/** 内存实现，用作测试替身。 */
export class InMemoryStore implements MemoryStore {
  private messages: StoredMessage[] = []
  private facts = new Map<string, Fact>()
  private relations = new Map<string, Relation>()
  private summaries: Summary[] = []

  async appendMessage(message: StoredMessage): Promise<void> {
    this.messages.push({ ...message })
  }

  async listMessages(sessionId: string): Promise<StoredMessage[]> {
    return this.messages
      .filter((message) => message.sessionId === sessionId)
      .sort((a, b) => a.ts - b.ts)
      .map((message) => ({ ...message }))
  }

  async clearSession(sessionId: string): Promise<void> {
    this.messages = this.messages.filter((message) => message.sessionId !== sessionId)
  }

  async listFacts(sessionId: string): Promise<Fact[]> {
    return [...this.facts.values()]
      .filter((fact) => fact.sessionId === sessionId)
      .map((fact) => ({ ...fact, sourceMsgIds: [...fact.sourceMsgIds] }))
  }

  async applyFactOps(sessionId: string, ops: FactOp[], now: number): Promise<void> {
    const merged = mergeFactOps(sessionId, await this.listFacts(sessionId), ops, now)
    for (const [storageKey, fact] of this.facts) {
      if (fact.sessionId === sessionId) this.facts.delete(storageKey)
    }
    for (const fact of merged) {
      this.facts.set(`${sessionId}\u0000${fact.key}`, fact)
    }
  }

  async markFactFollowedUp(sessionId: string, key: string, now: number): Promise<void> {
    const storageKey = `${sessionId}\u0000${key}`
    const existing = this.facts.get(storageKey)
    if (existing === undefined) return
    this.facts.set(storageKey, { ...existing, followedUpAt: now })
  }

  async getRelation(sessionId: string): Promise<Relation> {
    const existing = this.relations.get(sessionId)
    const base = createDefaultRelation(sessionId, Date.now())
    return existing
      ? { ...base, ...existing, sharedExperiences: [...existing.sharedExperiences], boundaries: [...existing.boundaries] }
      : base
  }

  async updateRelation(sessionId: string, patch: Partial<Relation>): Promise<void> {
    const current = await this.getRelation(sessionId)
    this.relations.set(sessionId, { ...current, ...patch })
  }

  async listSummaries(sessionId: string): Promise<Summary[]> {
    return this.summaries
      .filter((summary) => summary.sessionId === sessionId)
      .sort((a, b) => a.ts - b.ts)
      .map((summary) => ({ ...summary }))
  }

  async appendSummary(sessionId: string, summary: Summary): Promise<void> {
    this.summaries.push({ ...summary, sessionId })
  }
}