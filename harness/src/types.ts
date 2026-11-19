export interface BenchOptions {
  tasksDir: string
  models: string[]
  runs: number
  target: string
  seed: number
  outDir: string
  ollamaBaseUrl: string
  workspaceRoot: string
  timeoutMs: number
}

export function parseModel(value: string): { providerID: string; modelID: string } {
  const index = value.indexOf("/")
  if (index === -1) return { providerID: "ollama", modelID: value }
  return { providerID: value.slice(0, index), modelID: value.slice(index + 1) }
}
