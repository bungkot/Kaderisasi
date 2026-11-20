import type { RunRecord } from "@kaderisasi/shared"
import { SCORING } from "@kaderisasi/shared"
import type { Summary } from "./aggregate.js"

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }
    return map[char] ?? char
  })
}

function fixed(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "—"
}

function heatColor(score: number): string {
  const hue = Math.max(0, Math.min(120, score * 1.2))
  return `hsl(${hue.toFixed(0)} 70% 32%)`
}

function renderCards(summary: Summary): string {
  const best = summary.models.reduce<{ model: string; passAt1: number } | null>((bestSoFar, model) => {
    if (!bestSoFar || model.passAt1 > bestSoFar.passAt1) return { model: model.model, passAt1: model.passAt1 }
    return bestSoFar
  }, null)
  const significant = summary.comparisons.filter((comparison) => comparison.significant).length
  const cards = [
    { label: "Model", value: String(summary.models.length) },
    { label: "Task", value: String(summary.models[0]?.tasks.length ?? 0) },
    { label: "Run", value: String(summary.totalRuns) },
    { label: "Pass@1 terbaik", value: best ? `${(best.passAt1 * 100).toFixed(0)}%` : "—" },
    { label: "Perbedaan signifikan", value: String(significant) },
  ]
  return cards.map((card) => `<div class="card"><div class="label">${escapeHtml(card.label)}</div><div class="value">${escapeHtml(card.value)}</div></div>`).join("")
}

function renderModelTable(summary: Summary): string {
  const rows = summary.models.map((model) => {
    const ci = `${fixed(model.ci[0])}–${fixed(model.ci[1])}`
    return `<tr><td>${escapeHtml(model.model)}</td><td>${model.runs}</td><td>${fixed(model.meanTotal)}</td><td>${model.sdTotal.toFixed(1)}</td><td>${ci}</td><td>${(model.passAt1 * 100).toFixed(0)}%</td><td>${Math.round(model.tokensPerRun)}</td><td>${(model.durationPerRunMs / 60000).toFixed(1)} mnt</td></tr>`
  }).join("")
  return `<table><thead><tr><th>Model</th><th>n</th><th>Mean</th><th>SD</th><th>CI 95%</th><th>Pass@1</th><th>Token/run</th><th>Durasi/run</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderHeatmap(summary: Summary): string {
  const taskIds = [...new Set(summary.models.flatMap((model) => model.tasks.map((task) => task.taskId)))].sort()
  const header = taskIds.map((task) => `<th>${escapeHtml(task)}</th>`).join("")
  const rows = summary.models.map((model) => {
    const cells = taskIds.map((taskId) => {
      const task = model.tasks.find((entry) => entry.taskId === taskId)
      if (!task) return "<td class=\"empty\">—</td>"
      return `<td style="background:${heatColor(task.meanTotal)}" title="${escapeHtml(model.model)} / ${escapeHtml(taskId)}: ${fixed(task.meanTotal)}">${fixed(task.meanTotal, 0)}</td>`
    }).join("")
    return `<tr><th>${escapeHtml(model.model)}</th>${cells}</tr>`
  }).join("")
  return `<table class="heatmap"><thead><tr><th>Model \\ Task</th>${header}</tr></thead><tbody>${rows}</tbody></table>`
}

function renderBars(summary: Summary): string {
  const max = Math.max(1, ...summary.models.map((model) => model.meanTotal))
  return summary.models.map((model) => {
    const width = (model.meanTotal / max) * 100
    return `<div class="bar-row"><div class="bar-label">${escapeHtml(model.model)}</div><div class="bar-track"><div class="bar-fill" style="width:${width.toFixed(1)}%">${fixed(model.meanTotal)}</div></div><div class="bar-ci">CI ${fixed(model.ci[0])}–${fixed(model.ci[1])}</div></div>`
  }).join("")
}

function renderErrors(summary: Summary): string {
  return Object.entries(summary.errorCounts).map(([name, count]) => `<tr><td>${escapeHtml(name)}</td><td>${count}</td></tr>`).join("")
}

function renderComparisons(summary: Summary): string {
  const rows = summary.comparisons.map((comparison) => {
    const p = comparison.pAdjusted === null ? "—" : comparison.pAdjusted.toFixed(4)
    const marker = comparison.significant ? " ✓" : ""
    return `<tr><td>${escapeHtml(comparison.a)}</td><td>${escapeHtml(comparison.b)}</td><td>${escapeHtml(comparison.taskId)}</td><td>${fixed(comparison.meanDiff)}</td><td>${p}${marker}</td></tr>`
  }).join("")
  if (!rows) return "<p>No model pair has enough runs to compare.</p>"
  return `<table><thead><tr><th>A</th><th>B</th><th>Task</th><th>Δ mean</th><th>p (Holm)</th></tr></thead><tbody>${rows}</tbody></table>`
}

export function renderReport(summary: Summary, records: RunRecord[]): string {
  const embedded = JSON.stringify({ summary, runs: records }).replace(/</g, "\\u003c")
  const style = `
:root{color-scheme:dark}body{margin:0;background:#0f1220;color:#e6e9f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:32px 20px 64px}h1{font-size:26px;margin:0 0 8px}h2{font-size:18px;margin:36px 0 12px;border-bottom:1px solid #2a3154;padding-bottom:8px}
p,li{font-size:14px;line-height:1.6;color:#b8c1e0}.muted{color:#8792b8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.card{background:#181d33;border:1px solid #2a3154;border-radius:10px;padding:14px}.card .label{font-size:12px;color:#8792b8;text-transform:uppercase;letter-spacing:.04em}.card .value{font-size:24px;font-weight:700;margin-top:6px;color:#6ea8fe}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #2a3154;padding:8px 10px;text-align:left}th{background:#181d33;color:#9fb0e0}td.empty{color:#59628a}
.heatmap td{text-align:center;font-weight:700;color:#fff}.bar-row{display:grid;grid-template-columns:180px 1fr 150px;gap:12px;align-items:center;margin-bottom:10px;font-size:13px}.bar-label{color:#b8c1e0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-track{background:#181d33;border:1px solid #2a3154;border-radius:6px;height:26px}.bar-fill{height:100%;background:linear-gradient(90deg,#3f6fd8,#6ea8fe);border-radius:6px;color:#08102a;font-weight:700;padding-left:8px;line-height:26px}.bar-ci{color:#8792b8;font-size:12px}
code,pre{background:#181d33;border:1px solid #2a3154;border-radius:6px;padding:2px 6px;color:#cbd5f9}pre{padding:14px;overflow:auto}
@media(max-width:800px){.bar-row{grid-template-columns:1fr}.grid{grid-template-columns:1fr 1fr}}`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agentic Pentest Benchmark — Report</title>
<style>${style}</style>
</head>
<body>
<main>
<h1>Agentic Pentest Benchmark</h1>
<p class="muted">Coding agent TypeScript · OpenCode V2 client · Ollama · OWASP Top 10:2025 — generated ${escapeHtml(summary.generatedAt)}</p>
<p class="muted">Target: ${escapeHtml(summary.target || "—")} · Seed: ${summary.seed} · Success threshold: score ≥ ${SCORING.successThreshold}</p>

<h2>Summary</h2>
<div class="grid">${renderCards(summary)}</div>

<h2>By model</h2>
${renderModelTable(summary)}

<h2>Task × model heatmap</h2>
${renderHeatmap(summary)}

<h2>Mean total score + 95% CI</h2>
${renderBars(summary)}

<h2>Error analysis</h2>
${renderErrors(summary)}

<h2>Model comparisons</h2>
${renderComparisons(summary)}

<h2>Limitations and integrity</h2>
<ul>
<li>All runs are retained, including failed ones; no cherry-picking.</li>
<li>Ground truth is never sent to the agent (task cards are stripped by the harness).</li>
<li>Evidence is scored with deterministic heuristics, not human review; the evidence subscore is an approximation.</li>
<li>Statistics use a normal approximation for Wilcoxon and 1000 bootstrap resamples; small n reduces statistical power.</li>
</ul>

<h2>Reproduction</h2>
<pre>npm install
npm run build
npx tsx harness/src/index.ts run --tasks ./harness/tasks --models ollama/huihui_ai/qwen3.5-abliterated:4B --runs 5 --target &lt;url&gt; --seed 42 --out ./runs
npx tsx harness/src/index.ts report --results ./runs/results.jsonl --out ./runs/report</pre>

<script type="application/json" id="benchmark-data">${embedded}</script>
</main>
</body>
</html>
`
}
