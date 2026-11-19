import { readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Logger } from "@kaderisasi/agent"
import type { RunRecord, TaskDefinition } from "@kaderisasi/shared"
import { ensureDir, readJson, shuffle, TaskDefinitionSchema, writeJson } from "@kaderisasi/shared"
import { aggregate } from "./aggregate.js"
import type { Summary } from "./aggregate.js"
import { createHarnessMetrics } from "./metrics.js"
import { runOne } from "./runner.js"
import type { BenchOptions } from "./types.js"

export async function loadTasks(tasksDir: string): Promise<TaskDefinition[]> {
  const files = (await readdir(tasksDir)).filter((file) => file.endsWith(".json")).sort()
  const tasks: TaskDefinition[] = []
  for (const file of files) {
    const raw = await readJson<unknown>(join(tasksDir, file))
    tasks.push(TaskDefinitionSchema.parse(raw))
  }
  return tasks
}

export async function runBenchmark(options: BenchOptions): Promise<Summary> {
  await ensureDir(options.outDir)
  await ensureDir(options.workspaceRoot)
  const tasks = await loadTasks(options.tasksDir)
  const records: RunRecord[] = []
  const metrics = createHarnessMetrics()
  const logger = new Logger({ component: "harness" })

  for (const model of options.models) {
    const ordered = shuffle(tasks, options.seed + model.length)
    for (const task of ordered) {
      for (let rep = 0; rep < options.runs; rep++) {
        const runLogger = logger.child({ task: task.id, model, rep })
        runLogger.info("harness", "run_start", { target: options.target })
        const record = await runOne(task, model, rep, options, runLogger)
        records.push(record)

        metrics.counter("agent_runs_total", "Total number of benchmark runs")
        if (record.run.status === "completed") {
          metrics.counter("agent_runs_completed_total", "Number of runs with status completed")
        } else {
          metrics.counter("agent_runs_failed_total", "Number of runs with status timeout or error")
        }
        if (record.evaluation.scores.safety === 0) {
          metrics.counter("agent_safety_violations_total", "Number of runs with a safety violation")
        }
        metrics.gauge("agent_run_duration_seconds", "Duration of the most recent run", {}, record.run.durationMs / 1000)
        metrics.gauge("agent_tokens_total", "Tokens used by the most recent run", {}, record.run.usage.input + record.run.usage.output)
        metrics.gauge("agent_score_total", "Total score of the most recent evaluation", {}, record.evaluation.scores.totalRun)

        runLogger.info("harness", "run_done", {
          status: record.run.status,
          score: record.evaluation.scores.totalRun.toFixed(1),
          errors: record.run.errors,
        })
      }
    }
  }

  await writeFile(join(options.outDir, "metrics.txt"), metrics.render(), "utf8")
  const summary = aggregate(records, options.seed, options.target)
  await writeJson(join(options.outDir, "summary.json"), summary)
  return summary
}
