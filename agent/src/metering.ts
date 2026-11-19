import type { Usage } from "@kaderisasi/shared"
import type { SessionMessage } from "./agent.js"

export interface Metering {
  usage: Usage
  cost: number
  steps: number
  toolCalls: number
}

export function meter(messages: SessionMessage[]): Metering {
  let input = 0
  let output = 0
  let reasoning = 0
  let cacheRead = 0
  let cacheWrite = 0
  let cost = 0
  let steps = 0
  let toolCalls = 0

  for (const message of messages) {
    const info = message.info as unknown as {
      role?: string
      tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } }
      cost?: number
    }
    if (info?.role !== "assistant") continue
    steps += 1
    const tokens = info.tokens
    if (tokens) {
      input += tokens.input ?? 0
      output += tokens.output ?? 0
      reasoning += tokens.reasoning ?? 0
      cacheRead += tokens.cache?.read ?? 0
      cacheWrite += tokens.cache?.write ?? 0
    }
    cost += info.cost ?? 0
    toolCalls += (message.parts ?? []).filter((part) => part.type === "tool").length
  }

  return {
    usage: { input, output, reasoning, cacheRead, cacheWrite },
    cost,
    steps,
    toolCalls,
  }
}
