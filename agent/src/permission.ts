import type { AgentOptions } from "@kaderisasi/shared"
import { MODELS } from "@kaderisasi/shared"

export const BASH_ALLOWLIST: string[] = [
  "python*",
  "python3*",
  "pip*",
  "ruff*",
  "ls*",
  "cat*",
  "head*",
  "tail*",
  "grep*",
  "find*",
  "mkdir*",
  "curl*",
  "echo*",
  "cd*",
  "wc*",
  "jq*",
  "git*",
]

const DISABLED_PROVIDERS = ["anthropic", "openai", "google", "github-copilot"]

const DISABLED_TOOLS = ["webfetch", "websearch", "subagent", "skill", "question"]

export interface PermissionRule {
  action: string
  resource: string
  effect: "allow" | "deny" | "ask"
}

export interface OpenCodeConfig {
  $schema?: string
  update?: "disable" | "notify" | "auto"
  share?: "disabled" | "manual" | "auto"
  model?: string
  mcp?: { servers?: Record<string, unknown> }
  plugins?: string[]
  policies?: PermissionRule[]
  providers?: Record<
    string,
    {
      name?: string
      package?: string
      settings?: Record<string, unknown>
      headers?: Record<string, string>
      body?: Record<string, unknown>
      models?: Record<string, { name?: string; capabilities?: { tools?: boolean } }>
    }
  >
  agents?: Record<
    string,
    {
      mode?: "primary" | "subagent" | "all"
      description?: string
      steps?: number
      permissions?: PermissionRule[]
    }
  >
}

export type PermissionReply = "once" | "always" | "reject"

export function buildAgentConfig(options: AgentOptions): OpenCodeConfig {
  const labels: Record<string, string> = {
    [MODELS.primary]: "Qwen3.5 4B Abliterated (uncensored)",
  }
  const models: NonNullable<NonNullable<OpenCodeConfig["providers"]>[string]["models"]> = {}
  for (const id of MODELS.all) models[id] = { name: labels[id] ?? id, capabilities: { tools: true } }
  if (options.model.providerID === "ollama" && !(options.model.modelID in models)) {
    models[options.model.modelID] = { name: options.model.modelID, capabilities: { tools: true } }
  }

  const permissions: PermissionRule[] = [
    { action: "external_directory", resource: "*", effect: "deny" },
    ...DISABLED_TOOLS.map((action) => ({ action, resource: "*", effect: "deny" as const })),
    { action: "shell", resource: "*", effect: "deny" },
    ...BASH_ALLOWLIST.map((pattern) => ({ action: "shell", resource: pattern, effect: "allow" as const })),
  ]

  const config: OpenCodeConfig = {
    $schema: "https://opencode.ai/config.json",
    update: "disable",
    share: "disabled",
    mcp: { servers: {} },
    plugins: [],
    policies: DISABLED_PROVIDERS.map((providerID) => ({
      action: "provider.use",
      resource: providerID,
      effect: "deny",
    })),
    providers: {
      ollama: {
        name: "Ollama",
        package: "@opencode/ai/providers/openai-compatible",
        settings: { baseURL: options.ollamaBaseUrl },
        body: { reasoning_effort: "none" },
        models,
      },
    },
    agents: {
      [options.agent]: {
        mode: "primary",
        description: "Builds a reproducible, non-destructive penetration-testing script for one OWASP Top 10:2025 category",
        steps: options.maxSteps,
        permissions,
      },
    },
  }
  return { ...config, ...(options.configExtra ?? {}) } as OpenCodeConfig
}

export function decidePermission(permission: { action: string }): PermissionReply {
  return permission.action === "shell" ? "once" : "once"
}
