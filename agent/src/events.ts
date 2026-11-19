import type { OpencodeClient } from "@opencode-ai/sdk"

export type EventHandler = (event: { type: string; properties?: Record<string, unknown> }) => void

export class EventBus {
  private readonly handlers = new Set<EventHandler>()
  private readonly client: OpencodeClient
  private stopped = false

  constructor(client: OpencodeClient) {
    this.client = client
  }

  start(directory?: string): void {
    void (async () => {
      try {
        const result = await this.client.event.subscribe(directory ? { query: { directory } } : {})
        for await (const event of result.stream) {
          if (this.stopped) break
          for (const handler of this.handlers) handler(event as { type: string; properties?: Record<string, unknown> })
        }
      } catch {
        return
      }
    })()
  }

  on(handler: EventHandler): () => void {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  stop(): void {
    this.stopped = true
    this.handlers.clear()
  }
}
