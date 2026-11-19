import assert from "node:assert/strict"
import { test } from "node:test"
import { EventBus } from "./events.js"

test("EventBus.stop aborts its pending event stream", async () => {
  let signal: AbortSignal | undefined
  let streamFinished = false
  const client = {
    event: {
      subscribe: async (options?: { signal?: AbortSignal }) => {
        signal = options?.signal
        return {
          stream: {
            async *[Symbol.asyncIterator]() {
              try {
                await new Promise<void>((resolve) => {
                  if (signal?.aborted) resolve()
                  else signal?.addEventListener("abort", () => resolve(), { once: true })
                })
              } finally {
                streamFinished = true
              }
            },
          },
        }
      },
    },
  }
  const events = new EventBus(client, (error) => {
    throw error
  })

  events.start()
  await new Promise<void>((resolve) => setImmediate(resolve))
  events.stop()
  await new Promise<void>((resolve) => setImmediate(resolve))

  assert.equal(signal?.aborted, true)
  assert.equal(streamFinished, true)
})
