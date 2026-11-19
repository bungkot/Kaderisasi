import { join } from "node:path"
import { executeTask, Logger, OpenCodeAgent } from "@kaderisasi/agent"
import type { AgentOptions, AgentTaskCard, RunRecord, TaskDefinition } from "@kaderisasi/shared"
import { AGENT_DEFAULTS, appendJsonl, ensureDir, makeRunId, stripGroundTruth, writeJson } from "@kaderisasi/shared"
import { evaluateRun } from "./evaluate.js"
import type { BenchOptions } from "./types.js"
import { parseModel } from "./types.js"

export async function runOne(
  task: TaskDefinition,
  model: string,
  rep: number,
  options: BenchOptions,
  logger: Logger,
): Promise<RunRecord> {
  const dir = join(options.outDir, model.replace(/[^a-zA-Z0-9._-]+/g, "-"), task.id, String(rep))
  await ensureDir(dir)

  const scope = [new URL(options.target).origin]
  const card: AgentTaskCard = {
    ...stripGroundTruth(task),
    target: options.target,
    scope,
  }
  const runId = makeRunId(model, `${task.id}_r${rep}`)
  const agentOptions: AgentOptions = {
    runId,
    model: parseModel(model),
    agent: AGENT_DEFAULTS.agent,
    timeoutMs: options.timeoutMs,
    maxSteps: AGENT_DEFAULTS.maxSteps,
    maxToolCalls: AGENT_DEFAULTS.maxToolCalls,
    maxRepairRounds: AGENT_DEFAULTS.maxRepairRounds,
    workspaceRoot: options.workspaceRoot,
    ollamaBaseUrl: options.ollamaBaseUrl,
  }

  const agent = new OpenCodeAgent(logger)
  const run = await executeTask(agent, card, agentOptions, logger)
  run.rep = rep
  await writeJson(join(dir, "run.json"), run)
  await writeJson(join(dir, "task.agent.json"), card)

  const evaluation = await evaluateRun(run, task)
  await writeJson(join(dir, "evaluation.json"), evaluation)
  await appendJsonl(join(options.outDir, "results.jsonl"), { run, evaluation })

  return { run, evaluation }
}
