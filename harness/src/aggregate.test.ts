import assert from "node:assert/strict"
import { test } from "node:test"
import type { RunRecord } from "@kaderisasi/shared"
import { aggregate } from "./aggregate.js"

function record(model: string, taskId: string, rep: number, score: number, coreHits: number): RunRecord {
  return {
    run: {
      runId: `${model}-${taskId}-${rep}`,
      taskId,
      model: { providerID: "ollama", modelID: model },
      status: "completed",
      workspace: "/tmp/workspace",
      artifacts: null,
      usage: { input: 100, output: 50, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      cost: 0,
      steps: 4,
      toolCalls: 6,
      repairRounds: 0,
      requests: 10,
      rep,
      durationMs: 60000,
      errors: [],
      diff: [],
    },
    evaluation: {
      runId: `${model}-${taskId}-${rep}`,
      taskId,
      model: `ollama/${model}`,
      scores: {
        discovery: score,
        evidence: score,
        correctness: score,
        reproducibility: 0,
        codeQuality: score,
        safety: 100,
        totalRun: score,
        totalTask: 0,
      },
      matched: [],
      falsePositives: [],
      categoryMismatch: false,
      errorClass: "ok",
      details: { coreHits, coreTotal: 2 },
    },
  }
}

test("aggregate computes reproducibility, totals and error counts", () => {
  const records = [
    record("model-a", "A05", 0, 80, 1),
    record("model-a", "A05", 1, 60, 1),
    record("model-b", "A05", 0, 40, 0),
    record("model-b", "A05", 1, 50, 0),
  ]
  const summary = aggregate(records, 42, "http://target.test")
  assert.equal(summary.totalRuns, 4)
  assert.equal(summary.models.length, 2)
  const a = summary.models.find((entry) => entry.model === "ollama/model-a")
  assert.ok(a)
  assert.equal(a?.tasks[0]?.successes, 2)
  assert.ok(a!.tasks[0]!.reproducibility > 70)
  assert.ok(a!.tasks[0]!.reproducibility <= 100)
  assert.ok(a!.meanTotal > 70)
  assert.equal(summary.errorCounts.ok, 4)
})

test("aggregate reports comparisons without p for tiny samples", () => {
  const records = [
    record("a", "A05", 0, 70, 1),
    record("a", "A05", 1, 72, 1),
    record("b", "A05", 0, 50, 1),
    record("b", "A05", 1, 55, 1),
  ]
  const summary = aggregate(records, 42)
  assert.equal(summary.comparisons.length, 1)
  assert.equal(summary.comparisons[0]?.p, null)
})
