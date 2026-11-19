export type RunStatus = "completed" | "timeout" | "error" | "aborted"

export type OwaspId =
  | "A01:2025"
  | "A02:2025"
  | "A03:2025"
  | "A04:2025"
  | "A05:2025"
  | "A06:2025"
  | "A07:2025"
  | "A08:2025"
  | "A09:2025"
  | "A10:2025"

export type Severity = "critical" | "high" | "medium" | "low" | "info"

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD"

export interface Finding {
  id: string
  title: string
  owasp_id: string
  severity: Severity
  endpoint: string
  method: HttpMethod
  evidence: string
  payload?: string
  confidence: number
  remediation?: string
}

export interface GroundTruthFinding {
  endpoint: string
  type: string
  payload?: string
  evidence?: string
  owasp_id?: string
  severity?: Severity
  core: boolean
}

export interface GroundTruth {
  findings: GroundTruthFinding[]
  notes?: string
}

export interface AgentTaskCard {
  id: string
  owasp_id: OwaspId
  title: string
  category: string
  target: string
  scope: string[]
  objective: string
  constraints: string[]
  deliverables: string[]
  estimated_requests: number
}

export interface TaskDefinition extends AgentTaskCard {
  ground_truth: GroundTruth
}

export interface Usage {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
}

export interface ArtifactPaths {
  mainPy: string
  findings: string
  requirements: string
  readme: string
  extra: string[]
}

export interface FileDiffLike {
  file: string
  additions: number
  deletions: number
}

export interface RunResult {
  runId: string
  taskId: string
  model: { providerID: string; modelID: string }
  status: RunStatus
  workspace: string
  artifacts: ArtifactPaths | null
  usage: Usage
  cost: number
  steps: number
  toolCalls: number
  repairRounds: number
  requests: number
  rep?: number
  durationMs: number
  errors: string[]
  diff: FileDiffLike[]
  transcriptPath?: string
  promptHash?: string
  agentConfigHash?: string
}

export interface ScoreBreakdown {
  discovery: number
  evidence: number
  correctness: number
  reproducibility: number
  codeQuality: number
  safety: number
  totalRun: number
  totalTask: number
}

export type ErrorClass =
  | "ok"
  | "timeout"
  | "error"
  | "invalid_findings"
  | "missing_artifact"
  | "no_true_positive"
  | "false_positives"
  | "category_mismatch"

export interface Evaluation {
  runId: string
  taskId: string
  model: string
  scores: ScoreBreakdown
  matched: string[]
  falsePositives: string[]
  categoryMismatch: boolean
  errorClass: ErrorClass
  details: Record<string, unknown>
}

export interface RunRecord {
  run: RunResult
  evaluation: Evaluation
}

export interface AgentOptions {
  runId: string
  model: { providerID: string; modelID: string }
  agent: string
  timeoutMs: number
  maxSteps: number
  maxToolCalls: number
  maxRepairRounds: number
  workspaceRoot: string
  ollamaBaseUrl: string
  configExtra?: Record<string, unknown>
}
