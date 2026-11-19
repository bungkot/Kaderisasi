export interface MetricLabels {
  [key: string]: string
}

function labelKey(labels: MetricLabels): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) return ""
  return `{${entries.map(([key, value]) => `${key}="${value}"`).join(",")}}`
}

export class MetricsRegistry {
  private readonly values = new Map<string, { name: string; labels: MetricLabels; value: number; help: string; type: "counter" | "gauge" }>()

  private set(name: string, labels: MetricLabels, value: number, type: "counter" | "gauge", help: string): void {
    this.values.set(`${name}${labelKey(labels)}`, { name, labels, value, type, help })
  }

  counter(name: string, help: string, labels: MetricLabels = {}, value = 1): void {
    const key = `${name}${labelKey(labels)}`
    const current = this.values.get(key)?.value ?? 0
    this.set(name, labels, current + value, "counter", help)
  }

  gauge(name: string, help: string, labels: MetricLabels = {}, value: number): void {
    this.set(name, labels, value, "gauge", help)
  }

  render(): string {
    const lines: string[] = []
    const seen = new Set<string>()
    for (const metric of this.values.values()) {
      if (!seen.has(metric.name)) {
        seen.add(metric.name)
        lines.push(`# HELP ${metric.name} ${metric.help}`)
        lines.push(`# TYPE ${metric.name} ${metric.type}`)
      }
      lines.push(`${metric.name}${labelKey(metric.labels)} ${metric.value}`)
    }
    return `${lines.join("\n")}\n`
  }
}

export function createHarnessMetrics(): MetricsRegistry {
  const registry = new MetricsRegistry()
  registry.counter("agent_runs_total", "Total number of benchmark runs")
  registry.counter("agent_runs_completed_total", "Number of runs with status completed")
  registry.counter("agent_runs_failed_total", "Number of runs with status timeout or error")
  registry.counter("agent_safety_violations_total", "Number of runs with a safety violation")
  registry.gauge("agent_run_duration_seconds", "Duration of the most recent run", {}, 0)
  registry.gauge("agent_tokens_total", "Tokens used by the most recent run", {}, 0)
  registry.gauge("agent_score_total", "Total score of the most recent evaluation", {}, 0)
  return registry
}
