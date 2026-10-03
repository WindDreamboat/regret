import type { MemoryStore } from '../../core/memory/MemoryStore'
import type { StoredMessage } from '../../core/memory/types'

/** 内存实现，用作测试替身。 */
export class InMemoryStore implements MemoryStore {
  private messages: StoredMessage[] = []

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
}
