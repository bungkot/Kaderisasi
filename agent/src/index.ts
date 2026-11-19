import { Command } from "commander"
import type { AgentOptions, AgentTaskCard } from "@kaderisasi/shared"
import { AgentTaskCardSchema, AGENT_DEFAULTS, MODELS, makeRunId, readJson, writeJson } from "@kaderisasi/shared"
import { OpenCodeAgent } from "./agent.js"
import { Logger } from "./logger.js"
import { executeTask } from "./loop.js"
import { buildAgentConfig } from "./permission.js"
import { checkToolCalling } from "./toolcheck.js"

interface CliOptions {
  task: string
  target?: string
  workspaceRoot: string
  model: string
  ollamaBaseUrl: string
  out: string
  agent: string
  timeoutMs: number
  maxRepairRounds: number
}

function parseModel(value: string): { providerID: string; modelID: string } {
  const index = value.indexOf("/")
  if (index === -1) return { providerID: "ollama", modelID: value }
  return { providerID: value.slice(0, index), modelID: value.slice(index + 1) }
}

const program = new Command()
program.name("kaderisasi-agent").description("Run one OWASP task card through the OpenCode coding agent")

program
  .command("run")
  .description("Execute a single task card")
  .requiredOption("--task <path>", "path to a task JSON file")
  .option("--target <url>", "override task target URL (for local lab)")
  .requiredOption("--workspace-root <dir>", "root directory for run workspaces")
  .requiredOption("--model <provider/model>", "model, e.g. ollama/qwen2.5-coder:3b")
  .requiredOption("--ollama-base-url <url>", "Ollama OpenAI-compatible base URL")
  .requiredOption("--out <path>", "path to write run.json")
  .option("--agent <name>", "OpenCode agent name", AGENT_DEFAULTS.agent)
  .option("--timeout-ms <ms>", "timeout per run in ms", Number, AGENT_DEFAULTS.timeoutMs)
  .option("--max-repair-rounds <n>", "maximum repair rounds", Number, AGENT_DEFAULTS.maxRepairRounds)
  .action(async (opts: unknown) => {
    const o = opts as CliOptions
    const logger = new Logger({ component: "agent-cli" })
    const card: AgentTaskCard = AgentTaskCardSchema.parse(await readJson<unknown>(o.task))
    const task: AgentTaskCard = o.target
      ? { ...card, target: o.target, scope: [new URL(o.target).origin] }
      : card
    const model = parseModel(o.model)
    const options: AgentOptions = {
      runId: makeRunId(model.modelID, task.id),
      model,
      agent: o.agent,
      timeoutMs: o.timeoutMs,
      maxSteps: AGENT_DEFAULTS.maxSteps,
      maxToolCalls: AGENT_DEFAULTS.maxToolCalls,
      maxRepairRounds: o.maxRepairRounds,
      workspaceRoot: o.workspaceRoot,
      ollamaBaseUrl: o.ollamaBaseUrl,
    }
    const agent = new OpenCodeAgent(logger)
    const run = await executeTask(agent, task, options, logger)
    await writeJson(o.out, run)
    logger.info("cli", "run_persisted", { runId: run.runId, status: run.status, out: o.out })
    if (run.status !== "completed") process.exitCode = 1
  })

program
  .command("config")
  .description("Print the generated OpenCode config for a model")
  .option("--model <provider/model>", "model, e.g. ollama/huihui_ai/qwen3.5-abliterated:4B", `ollama/${MODELS.primary}`)
  .option("--ollama-base-url <url>", "Ollama base URL", "http://127.0.0.1:11434/v1")
  .option("--agent <name>", "OpenCode agent name", AGENT_DEFAULTS.agent)
  .action(async (opts: unknown) => {
    const o = opts as { model: string; ollamaBaseUrl: string; agent: string }
    const options: AgentOptions = {
      runId: "config-preview",
      model: parseModel(o.model),
      agent: o.agent,
      timeoutMs: AGENT_DEFAULTS.timeoutMs,
      maxSteps: AGENT_DEFAULTS.maxSteps,
      maxToolCalls: AGENT_DEFAULTS.maxToolCalls,
      maxRepairRounds: AGENT_DEFAULTS.maxRepairRounds,
      workspaceRoot: "./workspaces",
      ollamaBaseUrl: o.ollamaBaseUrl,
    }
    process.stdout.write(`${JSON.stringify(buildAgentConfig(options), null, 2)}\n`)
  })

program
  .command("toolcheck")
  .description("Verifikasi apakah model benar-benar memanggil tool via OpenCode")
  .option("--model <provider/model>", "model yang diuji", `ollama/${MODELS.primary}`)
  .option("--ollama-base-url <url>", "Ollama base URL", "http://127.0.0.1:11434/v1")
  .option("--timeout-ms <ms>", "timeout", Number, 120_000)
  .action(async (opts: unknown) => {
    const o = opts as { model: string; ollamaBaseUrl: string; timeoutMs: number }
    const logger = new Logger({ component: "toolcheck-cli" })
    const options: AgentOptions = {
      runId: "toolcheck",
      model: parseModel(o.model),
      agent: AGENT_DEFAULTS.agent,
      timeoutMs: o.timeoutMs,
      maxSteps: 3,
      maxToolCalls: 3,
      maxRepairRounds: 0,
      workspaceRoot: "./runs/workspaces",
      ollamaBaseUrl: o.ollamaBaseUrl,
    }
    const result = await checkToolCalling(options, logger)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    if (!result.ok) process.exitCode = 1
  })

await program.parseAsync(process.argv)
