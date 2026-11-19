import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { AgentOptions, AgentTaskCard, RunResult, RunStatus } from "@kaderisasi/shared"
import { sha256, writeJson } from "@kaderisasi/shared"
import { OpenCodeAgent } from "./agent.js"
import type { Logger } from "./logger.js"
import { meter } from "./metering.js"
import { buildAgentConfig } from "./permission.js"
import { buildPrompt } from "./prompts.js"
import { detectLeaks, validateWorkspace } from "./workspace.js"
import type { ValidationResult } from "./workspace.js"

export async function executeTask(
  agent: OpenCodeAgent,
  task: AgentTaskCard,
  options: AgentOptions,
  logger: Logger,
): Promise<RunResult> {
  const workspace = join(options.workspaceRoot, options.runId)
  await mkdir(workspace, { recursive: true })
  await writeJson(join(workspace, "task.agent.json"), task)

  const initialPrompt = buildPrompt(task, workspace, null)
  const config = buildAgentConfig(options)
  const run: RunResult = {
    runId: options.runId,
    taskId: task.id,
    model: options.model,
    status: "error" satisfies RunStatus,
    workspace,
    artifacts: null,
    usage: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
    cost: 0,
    steps: 0,
    toolCalls: 0,
    repairRounds: 0,
    requests: 0,
    durationMs: 0,
    errors: [],
    diff: [],
    promptHash: sha256(initialPrompt),
    agentConfigHash: sha256(JSON.stringify(config)),
  }

  const startedAt = Date.now()

  try {
    await agent.start(config)
    const sessionID = await agent.createSession(workspace, options.runId)
    let promptText = initialPrompt
    let validation: ValidationResult | null = null

    for (;;) {
      try {
        await agent.prompt(sessionID, options.agent, options.model, promptText)
        run.requests += 1
        const outcome = await agent.waitForIdle(sessionID, Date.now() + options.timeoutMs)
        if (outcome === "timeout") {
          run.status = "timeout"
          run.errors.push("agent_timeout")
          break
        }
        if (outcome === "error") {
          run.status = "error"
          run.errors.push("session_error: session stream reported an error")
          break
        }
      } catch (err) {
        run.status = "error"
        run.errors.push(`session_error: ${err instanceof Error ? err.message : String(err)}`)
        break
      }

      validation = await validateWorkspace(workspace, { compile: true })
      if (validation.ok) {
        run.status = "completed"
        run.artifacts = validation.artifacts
        break
      }

      run.errors.push(...validation.errors)
      logger.warn("loop", "validation_failed", { runId: options.runId, errors: validation.errors })
      if (run.repairRounds >= options.maxRepairRounds) {
        run.status = "error"
        break
      }
      run.repairRounds += 1
      promptText = buildPrompt(task, workspace, validation.errors)
      logger.info("loop", "repair", { runId: options.runId, repairRounds: run.repairRounds })
    }

    const messages = await agent.collectMessages(sessionID)
    const transcriptPath = join(dirname(options.workspaceRoot), "transcripts", `${options.runId}.json`)
    await writeJson(transcriptPath, {
      runId: options.runId,
      taskId: task.id,
      model: options.model,
      messages,
    })
    run.transcriptPath = transcriptPath

    const metering = meter(messages)
    run.usage = metering.usage
    run.cost = metering.cost
    run.steps = metering.steps
    run.toolCalls = metering.toolCalls

    const diff = await agent.collectDiff(sessionID)
    run.diff = diff.map((entry) => ({ file: entry.file, additions: entry.additions, deletions: entry.deletions }))
    const leaks = detectLeaks(diff, workspace)
    if (leaks.length > 0) {
      run.status = "error"
      run.errors.push(`security_violation:${leaks.join(",")}`)
    }

    await agent.stop()
  } catch (err) {
    run.status = "error"
    run.errors.push(err instanceof Error ? err.message : String(err))
    await agent.stop().catch(() => undefined)
  } finally {
    run.durationMs = Date.now() - startedAt
  }

  logger.info("loop", "task_end", {
    runId: options.runId,
    status: run.status,
    durationMs: run.durationMs,
    errors: run.errors.length,
  })
  return run
}
