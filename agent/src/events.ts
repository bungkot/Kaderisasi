export type EventHandler = (event: { type: string; properties?: Record<string, unknown> }) => void

interface EventStreamClient {
  event: {
    subscribe(options?: {
      query?: { directory?: string }
      signal?: AbortSignal
    }): Promise<{ stream: AsyncIterable<unknown> }>
  }
}

export class EventBus {
  private readonly handlers = new Set<EventHandler>()
  private readonly client: EventStreamClient
  private readonly onError: (error: unknown) => void
  private controller: AbortController | null = null
  private stopped = false

  constructor(client: EventStreamClient, onError: (error: unknown) => void) {
    this.client = client
    this.onError = onError
  }

  start(directory?: string): void {
    const controller = new AbortController()
    this.controller = controller
    void (async () => {
      try {
        const result = await this.client.event.subscribe({
          ...(directory ? { query: { directory } } : {}),
          signal: controller.signal,
        })
        for await (const event of result.stream) {
          if (this.stopped || controller.signal.aborted) break
          for (const handler of this.handlers) handler(event as { type: string; properties?: Record<string, unknown> })
        }
      } catch (error) {
        if (!controller.signal.aborted) this.onError(error)
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
    this.controller?.abort()
    this.controller = null
    this.handlers.clear()
  }
}
