export interface BusEvent {
  type: string
  data?: Record<string, unknown>
  location?: { directory?: string }
}

export type EventHandler = (event: BusEvent) => void

type Subscribe = (signal: AbortSignal) => AsyncIterable<BusEvent>

export class EventBus {
  private readonly handlers = new Set<EventHandler>()
  private readonly onError: (error: unknown) => void
  private controller: AbortController | null = null
  private stopped = false

  constructor(
    private readonly subscribe: Subscribe,
    onError: (error: unknown) => void,
  ) {
    this.onError = onError
  }

  start(): void {
    const controller = new AbortController()
    this.controller = controller
    void (async () => {
      try {
        for await (const event of this.subscribe(controller.signal)) {
          if (this.stopped || controller.signal.aborted) break
          for (const handler of this.handlers) handler(event)
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
