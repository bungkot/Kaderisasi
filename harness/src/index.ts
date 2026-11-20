import { readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { Command } from "commander"
import type { RunRecord } from "@kaderisasi/shared"
import { AGENT_DEFAULTS, ensureDir, writeJson } from "@kaderisasi/shared"
import { aggregate } from "./aggregate.js"
import type { Summary } from "./aggregate.js"
import { loadTasks, runBenchmark } from "./orchestrator.js"
import { renderReport } from "./report.js"
import type { BenchOptions } from "./types.js"

async function readRecords(path: string): Promise<RunRecord[]> {
  const raw = await readFile(path, "utf8")
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as RunRecord)
}

async function buildReport(results: string, outDir: string, seed: number, target: string): Promise<Summary> {
  const records = await readRecords(results)
  const summary = aggregate(records, seed, target)
  await ensureDir(outDir)
  await writeJson(join(outDir, "summary.json"), summary)
  const reportPath = join(outDir, "index.html")
  await ensureDir(dirname(reportPath))
  await writeFile(reportPath, renderReport(summary, records), "utf8")
  return summary
}

const program = new Command()
program.name("kaderisasi-harness").description("Benchmark harness untuk coding agent OpenCode + Ollama")

program
  .command("run")
  .description("Jalankan benchmark penuh")
  .requiredOption("--tasks <dir>", "direktori task JSON")
  .requiredOption("--models <list>", "daftar model dipisah koma")
  .requiredOption("--target <url>", "URL target Juice Shop")
  .option("--runs <n>", "replikasi per (model, task)", Number, 5)
  .option("--seed <n>", "seed randomisasi", Number, 42)
  .option("--out <dir>", "direktori output", "./runs")
  .option("--ollama-base-url <url>", "Ollama base URL", "http://127.0.0.1:11434/v1")
  .option("--workspace-root <dir>", "root workspace per run", "./workspaces")
  .option("--timeout-ms <ms>", "timeout per run", Number, AGENT_DEFAULTS.timeoutMs)
  .action(async (opts: unknown) => {
    const o = opts as Omit<BenchOptions, "tasksDir" | "outDir" | "models"> & {
      models: string
      tasks: string
      out: string
    }
    const options: BenchOptions = {
      tasksDir: o.tasks,
      outDir: o.out,
      models: o.models.split(",").map((model) => model.trim()).filter(Boolean),
      runs: o.runs,
      target: o.target,
      seed: o.seed,
      ollamaBaseUrl: o.ollamaBaseUrl,
      workspaceRoot: o.workspaceRoot,
      timeoutMs: o.timeoutMs,
    }
    const summary = await runBenchmark(options)
    await buildReport(join(options.outDir, "results.jsonl"), join(options.outDir, "report"), options.seed, options.target)
    process.stdout.write(`Selesai: ${summary.totalRuns} run, ${summary.models.length} model.\n`)
  })

program
  .command("aggregate")
  .description("Agregasi ulang results.jsonl menjadi summary.json")
  .requiredOption("--results <path>", "path results.jsonl")
  .requiredOption("--out <path>", "path summary.json")
  .option("--seed <n>", "seed", Number, 42)
  .option("--target <url>", "URL target", "")
  .action(async (opts: unknown) => {
    const o = opts as { results: string; out: string; seed: number; target: string }
    const records = await readRecords(o.results)
    const summary = aggregate(records, o.seed, o.target)
    await writeJson(o.out, summary)
    process.stdout.write(`Summary ditulis: ${o.out}\n`)
  })

program
  .command("report")
  .description("Bangun ulang infografis HTML dari results.jsonl")
  .requiredOption("--results <path>", "path results.jsonl")
  .requiredOption("--out <dir>", "direktori laporan")
  .option("--seed <n>", "seed", Number, 42)
  .option("--target <url>", "URL target", "")
  .action(async (opts: unknown) => {
    const o = opts as { results: string; out: string; seed: number; target: string }
    const summary = await buildReport(o.results, o.out, o.seed, o.target)
    process.stdout.write(`Laporan ditulis: ${join(o.out, "index.html")} (${summary.totalRuns} run)\n`)
  })

program
  .command("verify")
  .description("Validasi semua task card dan ground truth")
  .requiredOption("--tasks <dir>", "direktori task JSON")
  .action(async (opts: unknown) => {
    const o = opts as { tasks: string }
    const tasks = await loadTasks(o.tasks)
    process.stdout.write(`Valid: ${tasks.length} task (${tasks.map((task) => task.id).join(", ")})\n`)
  })

await program.parseAsync(process.argv)
