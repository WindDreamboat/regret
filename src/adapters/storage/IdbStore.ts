import Dexie, { type EntityTable } from 'dexie'
import type { MemoryStore } from '../../core/memory/MemoryStore'
import type { StoredMessage } from '../../core/memory/types'

const DEFAULT_DATABASE_NAME = 'regret'

class RegretDatabase extends Dexie {
  messages!: EntityTable<StoredMessage, 'id'>

  constructor(name: string) {
    super(name)
    this.version(1).stores({ messages: '++id, sessionId, ts' })
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
}
