import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AgentOptions } from "@kaderisasi/shared"
import { OpenCodeAgent } from "./agent.js"
import type { Logger } from "./logger.js"
import { buildAgentConfig } from "./permission.js"

export interface ToolCheckResult {
  ok: boolean
  outcome: string
  toolCalls: string[]
  toolDetails: string[]
  availableTools: string[]
  finalStatus: string | undefined
  finalText: string
  errors: string[]
}

export async function checkToolCalling(options: AgentOptions, logger: Logger): Promise<ToolCheckResult> {
  const workspace = await mkdtemp(join(tmpdir(), "kaderisasi-toolcheck-"))
  const config = buildAgentConfig(options)
  const agent = new OpenCodeAgent(logger)
  const result: ToolCheckResult = {
    ok: false,
    outcome: "error",
    toolCalls: [],
    toolDetails: [],
    availableTools: [],
    finalStatus: undefined,
    finalText: "",
    errors: [],
  }

  try {
    await agent.start(config)
    agent.handlePermissions(() => "once")
    const sessionID = await agent.createSession(workspace, "toolcheck")
    await agent.promptAndWait(
      sessionID,
      options.agent,
      options.model,
      "/no_think\nRun this exact shell command once: echo TOOL_OK\nDo not run it again. After the tool result, reply only DONE.",
      options.timeoutMs,
    )
    result.outcome = "idle"
    const messages = await agent.collectMessages(sessionID)
    for (const { parts } of messages) {
      for (const part of parts) {
        const value = part as unknown as { type: string; tool?: string; text?: string; state?: unknown }
        if (value.type === "tool") {
          result.toolCalls.push(value.tool ?? "unknown")
          result.toolDetails.push(JSON.stringify(value))
        } else if (value.type === "text") {
          result.finalText += value.text ?? ""
        }
      }
    }
    result.ok = result.toolCalls.some((name) => name === "bash" || name === "shell")
    if (!result.ok) result.errors.push("model did not emit a bash/shell tool call through OpenCode")
  } catch (err) {
    result.outcome = "error"
    result.errors.push(err instanceof Error ? err.message : String(err))
  } finally {
    result.finalStatus = result.outcome
    await agent.stop().catch(() => undefined)
  }

  logger.info("toolcheck", "done", { model: options.model.modelID, ok: result.ok, outcome: result.outcome })
  return result
}
