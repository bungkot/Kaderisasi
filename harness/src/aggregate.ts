import { clamp, mean, SCORING, seededRandom, standardDeviation } from "@kaderisasi/shared"
import type { ErrorClass, RunRecord } from "@kaderisasi/shared"

export interface TaskAggregate {
  model: string
  taskId: string
  n: number
  successes: number
  successRate: number
  reproducibility: number
  meanTotal: number
  sdTotal: number
  ci: [number, number]
  cv: number
  passAt1: number
  passAtK: Record<string, number>
  subscores: {
    discovery: number
    evidence: number
    correctness: number
    codeQuality: number
    safety: number
  }
}

export interface ModelAggregate {
  model: string
  runs: number
  meanTotal: number
  sdTotal: number
  ci: [number, number]
  passAt1: number
  tokensPerRun: number
  durationPerRunMs: number
  tasks: TaskAggregate[]
}

export interface Comparison {
  a: string
  b: string
  taskId: string
  meanDiff: number
  w: number
  p: number | null
  pAdjusted: number | null
  significant: boolean
}

export interface Summary {
  generatedAt: string
  target: string
  seed: number
  totalRuns: number
  models: ModelAggregate[]
  comparisons: Comparison[]
  errorCounts: Record<ErrorClass, number>
  note: string
}

const ERROR_CLASSES: ErrorClass[] = [
  "ok",
  "timeout",
  "error",
  "invalid_findings",
  "missing_artifact",
  "no_true_positive",
  "false_positives",
  "category_mismatch",
]

function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let result = 1
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i
  return result
}

function passAtK(successes: number, total: number, k: number): number {
  if (total === 0) return 0
  if (total - successes < k) return 1
  return 1 - combination(total - successes, k) / combination(total, k)
}

function wilson(successes: number, total: number, z = 1.96): [number, number] {
  if (total === 0) return [0, 0]
  const p = successes / total
  const denominator = 1 + (z * z) / total
  const center = (p + (z * z) / (2 * total)) / denominator
  const margin = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator
  return [clamp(center - margin, 0, 1), clamp(center + margin, 0, 1)]
}

function bootstrapCi(values: number[], seed: number, resamples = 1000): [number, number] {
  if (values.length === 0) return [0, 0]
  if (values.length === 1) return [values[0]!, values[0]!]
  const random = seededRandom(seed)
  const means: number[] = []
  for (let r = 0; r < resamples; r++) {
    const sample: number[] = []
    for (let i = 0; i < values.length; i++) {
      sample.push(values[Math.floor(random() * values.length)]!)
    }
    means.push(mean(sample))
  }
  means.sort((a, b) => a - b)
  const low = Math.floor(0.025 * resamples)
  const high = Math.floor(0.975 * resamples)
  return [means[low] ?? means[0]!, means[high] ?? means[means.length - 1]!]
}

function rankWithTies(values: number[]): number[] {
  const indices = values.map((_, index) => index).sort((a, b) => values[a]! - values[b]!)
  const ranks = new Array<number>(values.length).fill(0)
  let i = 0
  while (i < indices.length) {
    let j = i
    while (j + 1 < indices.length && values[indices[j + 1]!] === values[indices[i]!]) j++
    const averageRank = (i + 1 + j + 1) / 2
    for (let k = i; k <= j; k++) ranks[indices[k]!] = averageRank
    i = j + 1
  }
  return ranks
}

function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const density = 0.3989422804014327 * Math.exp((-x * x) / 2)
  let probability =
    density * t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  if (x > 0) probability = 1 - probability
  return clamp(probability, 0, 1)
}

function wilcoxon(a: number[], b: number[]): { w: number; p: number | null } {
  const differences = a.map((value, index) => value - b[index]!).filter((value) => value !== 0)
  const n = differences.length
  if (n < 5) return { w: Number.NaN, p: null }
  const ranks = rankWithTies(differences.map(Math.abs))
  let wPlus = 0
  let wMinus = 0
  differences.forEach((difference, index) => {
    if (difference > 0) wPlus += ranks[index]!
    else wMinus += ranks[index]!
  })
  const w = Math.min(wPlus, wMinus)
  const mu = (n * (n + 1)) / 4
  const counts = new Map<number, number>()
  for (const value of differences.map(Math.abs)) counts.set(value, (counts.get(value) ?? 0) + 1)
  let tieCorrection = 0
  for (const size of counts.values()) tieCorrection += size ** 3 - size
  const variance = (n * (n + 1) * (2 * n + 1)) / 24 - tieCorrection / 48
  if (variance <= 0) return { w, p: null }
  const z = (w - mu + 0.5) / Math.sqrt(variance)
  return { w, p: clamp(2 * normalCdf(z), 0, 1) }
}

function holmAdjust(values: Array<number | null>): Array<number | null> {
  const indexed = values
    .map((p, index) => ({ p, index }))
    .filter((entry): entry is { p: number; index: number } => entry.p !== null)
    .sort((a, b) => a.p - b.p)
  const adjusted = new Array<number | null>(values.length).fill(null)
  const size = indexed.length
  let running = 0
  indexed.forEach((entry, rank) => {
    running = Math.max(running, (size - rank) * entry.p)
    adjusted[entry.index] = clamp(running, 0, 1)
  })
  return adjusted
}

function totalTaskOf(record: RunRecord, reproducibility: number): number {
  const base = record.evaluation.scores.totalRun
  return clamp(base + SCORING.reproducibility * reproducibility, 0, 100)
}

export function aggregate(records: RunRecord[], seed = 42, target = ""): Summary {
  const errorCounts = Object.fromEntries(ERROR_CLASSES.map((name) => [name, 0])) as Record<ErrorClass, number>
  for (const record of records) errorCounts[record.evaluation.errorClass] += 1

  const modelNames = [...new Set(records.map((record) => record.evaluation.model))].sort()
  const models: ModelAggregate[] = []

  for (const model of modelNames) {
    const modelRecords = records.filter((record) => record.evaluation.model === model)
    const taskIds = [...new Set(modelRecords.map((record) => record.evaluation.taskId))].sort()
    const tasks: TaskAggregate[] = []

    for (const taskId of taskIds) {
      const taskRecords = modelRecords.filter((record) => record.evaluation.taskId === taskId)
      const runTotals = taskRecords.map((record) => record.evaluation.scores.totalRun)
      const cvMean = mean(runTotals)
      const cv = cvMean === 0 ? 0 : standardDeviation(runTotals) / cvMean
      const successes = taskRecords.filter((record) => Number(record.evaluation.details.coreHits ?? 0) > 0).length
      const successRate = taskRecords.length === 0 ? 0 : successes / taskRecords.length
      const reproducibility = clamp(100 * successRate * (1 - Math.min(cv, 0.5)), 0, 100)
      const taskTotals = taskRecords.map((record) => totalTaskOf(record, reproducibility))

      tasks.push({
        model,
        taskId,
        n: taskRecords.length,
        successes,
        successRate,
        reproducibility,
        meanTotal: mean(taskTotals),
        sdTotal: standardDeviation(taskTotals),
        ci: bootstrapCi(taskTotals, seed + model.length + taskId.length),
        cv,
        passAt1: mean(taskTotals.map((value) => (value >= SCORING.successThreshold ? 1 : 0))),
        passAtK: {
          "1": passAtK(taskTotals.filter((value) => value >= SCORING.successThreshold).length, taskTotals.length, 1),
          "3": passAtK(taskTotals.filter((value) => value >= SCORING.successThreshold).length, taskTotals.length, 3),
          "5": passAtK(taskTotals.filter((value) => value >= SCORING.successThreshold).length, taskTotals.length, 5),
        },
        subscores: {
          discovery: mean(taskRecords.map((record) => record.evaluation.scores.discovery)),
          evidence: mean(taskRecords.map((record) => record.evaluation.scores.evidence)),
          correctness: mean(taskRecords.map((record) => record.evaluation.scores.correctness)),
          codeQuality: mean(taskRecords.map((record) => record.evaluation.scores.codeQuality)),
          safety: mean(taskRecords.map((record) => record.evaluation.scores.safety)),
        },
      })
    }

    const allTotals = modelRecords.flatMap((record) => {
      const task = tasks.find((entry) => entry.taskId === record.evaluation.taskId)
      return [totalTaskOf(record, task?.reproducibility ?? 0)]
    })

    models.push({
      model,
      runs: modelRecords.length,
      meanTotal: mean(allTotals),
      sdTotal: standardDeviation(allTotals),
      ci: bootstrapCi(allTotals, seed + model.length),
      passAt1: mean(allTotals.map((value) => (value >= SCORING.successThreshold ? 1 : 0))),
      tokensPerRun: mean(modelRecords.map((record) => record.run.usage.input + record.run.usage.output)),
      durationPerRunMs: mean(modelRecords.map((record) => record.run.durationMs)),
      tasks,
    })
  }

  const comparisons: Comparison[] = []
  for (let i = 0; i < modelNames.length; i++) {
    for (let j = i + 1; j < modelNames.length; j++) {
      const a = modelNames[i]!
      const b = modelNames[j]!
      const taskIds = [
        ...new Set(
          records
            .filter((record) => record.evaluation.model === a || record.evaluation.model === b)
            .map((record) => record.evaluation.taskId),
        ),
      ].sort()
      for (const taskId of taskIds) {
        const aRecords = records.filter((r) => r.evaluation.model === a && r.evaluation.taskId === taskId)
        const bRecords = records.filter((r) => r.evaluation.model === b && r.evaluation.taskId === taskId)
        const aTask = models.find((m) => m.model === a)?.tasks.find((t) => t.taskId === taskId)
        const bTask = models.find((m) => m.model === b)?.tasks.find((t) => t.taskId === taskId)
        const aValues = aRecords
          .map((record, index) => ({
            rep: record.run.rep ?? index,
            value: totalTaskOf(record, aTask?.reproducibility ?? 0),
          }))
          .sort((x, y) => x.rep - y.rep)
          .map((entry) => entry.value)
        const bValues = bRecords
          .map((record, index) => ({
            rep: record.run.rep ?? index,
            value: totalTaskOf(record, bTask?.reproducibility ?? 0),
          }))
          .sort((x, y) => x.rep - y.rep)
          .map((entry) => entry.value)
        const size = Math.min(aValues.length, bValues.length)
        if (size < 2) continue
        const left = aValues.slice(0, size)
        const right = bValues.slice(0, size)
        const result = wilcoxon(left, right)
        comparisons.push({
          a,
          b,
          taskId,
          meanDiff: mean(left) - mean(right),
          w: result.w,
          p: result.p,
          pAdjusted: null,
          significant: false,
        })
      }
    }
  }

  const adjusted = holmAdjust(comparisons.map((comparison) => comparison.p))
  comparisons.forEach((comparison, index) => {
    comparison.pAdjusted = adjusted[index] ?? null
    comparison.significant = comparison.pAdjusted !== null && comparison.pAdjusted < 0.05
  })

  return {
    generatedAt: new Date().toISOString(),
    target,
    seed,
    totalRuns: records.length,
    models,
    comparisons,
    errorCounts,
    note:
      "Wilcoxon signed-rank uses a normal approximation with tie correction; p-values are Holm-adjusted across all task comparisons. " +
      "n<5 pairs are reported without a p-value. Bootstrap CIs use 1000 seeded resamples.",
  }
}

export { wilson }
