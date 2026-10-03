import Dexie, { type EntityTable, type Table } from 'dexie'
import type { MemoryStore } from '../../core/memory/MemoryStore'
import { applyFactOps as mergeFactOps } from '../../core/memory/extract'
import type { Fact, FactOp, Relation, StoredMessage, Summary } from '../../core/memory/types'
import { createDefaultRelation } from '../../core/memory/types'

const DEFAULT_DATABASE_NAME = 'regret'

class RegretDatabase extends Dexie {
  messages!: EntityTable<StoredMessage, 'id'>
  /** 复合主键 [sessionId+key]，同一事实在不同会话下相互隔离 */
  facts!: Table<Fact, [string, string]>
  relations!: EntityTable<Relation, 'sessionId'>
  summaries!: EntityTable<Summary, 'id'>

  constructor(name: string) {
    super(name)
    this.version(1).stores({ messages: '++id, sessionId, ts' })
    // version 2 只新增表，不改动 messages，无数据迁移
    this.version(2).stores({
      facts: '[sessionId+key], sessionId, category, status',
      relations: 'sessionId',
      summaries: '++id, sessionId, level, ts',
    })
  }
}

export interface IdbStoreOptions {
  /** 数据库名，测试时注入不同名称以隔离 */
  databaseName?: string
}

/** IndexedDB 实现，数据留在本地，不上传。 */
export class IdbStore implements MemoryStore {
  private readonly db: RegretDatabase

  constructor(options: IdbStoreOptions = {}) {
    this.db = new RegretDatabase(options.databaseName ?? DEFAULT_DATABASE_NAME)
  }

  async appendMessage(message: StoredMessage): Promise<void> {
    await this.db.messages.add(message)
  }

  async listMessages(sessionId: string): Promise<StoredMessage[]> {
    return this.db.messages.where('sessionId').equals(sessionId).sortBy('ts')
  }

  async clearSession(sessionId: string): Promise<void> {
    await this.db.messages.where('sessionId').equals(sessionId).delete()
  }

  async listFacts(sessionId: string): Promise<Fact[]> {
    return this.db.facts.where('sessionId').equals(sessionId).toArray()
  }

  async applyFactOps(sessionId: string, ops: FactOp[], now: number): Promise<void> {
    const existing = await this.listFacts(sessionId)
    const merged = mergeFactOps(sessionId, existing, ops, now)
    const mergedKeys = new Set(merged.map((fact) => fact.key))

    await this.db.transaction('rw', this.db.facts, async () => {
      for (const fact of existing) {
        if (!mergedKeys.has(fact.key)) {
          await this.db.facts.delete([sessionId, fact.key])
        }
      }
      for (const fact of merged) {
        await this.db.facts.put(fact)
      }
    })
  }

  async markFactFollowedUp(sessionId: string, key: string, now: number): Promise<void> {
    const existing = await this.db.facts.get([sessionId, key])
    if (existing === undefined) return
    await this.db.facts.put({ ...existing, followedUpAt: now })
  }

  async getRelation(sessionId: string): Promise<Relation> {
    const existing = await this.db.relations.get(sessionId)
    // 旧数据可能缺少后加的情绪字段，用默认值兜底后再覆盖已有字段
    return { ...createDefaultRelation(sessionId, Date.now()), ...existing }
  }

  async updateRelation(sessionId: string, patch: Partial<Relation>): Promise<void> {
    const current = await this.getRelation(sessionId)
    await this.db.relations.put({ ...current, ...patch, sessionId })
  }

  async listSummaries(sessionId: string): Promise<Summary[]> {
    return this.db.summaries.where('sessionId').equals(sessionId).sortBy('ts')
  }

  async appendSummary(sessionId: string, summary: Summary): Promise<void> {
    await this.db.summaries.add({ ...summary, sessionId })
  }
}