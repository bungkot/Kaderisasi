export const SCORING = {
  discovery: 0.4,
  evidence: 0.2,
  correctness: 0.15,
  reproducibility: 0.1,
  codeQuality: 0.1,
  safety: 0.05,
  successThreshold: 60,
  excellentThreshold: 80,
  failThreshold: 40,
  maxRepairRounds: 3,
  maxSteps: 60,
  maxToolCalls: 120,
  rateLimitRps: 5,
  maxRequestsPerRun: 300,
} as const

export const AGENT_DEFAULTS = {
  timeoutMs: 15 * 60 * 1000,
  maxSteps: SCORING.maxSteps,
  maxToolCalls: SCORING.maxToolCalls,
  maxRepairRounds: SCORING.maxRepairRounds,
  agent: "pentest-builder",
  providerID: "ollama",
} as const

export const MODELS = {
  primary: "huihui_ai/qwen3.5-abliterated:4B",
  all: ["huihui_ai/qwen3.5-abliterated:4B"],
} as const

export const PATHS = {
  resultsJsonl: "results.jsonl",
  summaryJson: "summary.json",
  reportDir: "report",
  transcriptsDir: "transcripts",
  workspaceRoot: "workspaces",
} as const
