import type { Config, Permission } from "@opencode-ai/sdk"
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

const TOOLS: { [key: string]: boolean } = {
  read: true,
  write: true,
  edit: true,
  bash: true,
  glob: true,
  grep: true,
  list: true,
  webfetch: false,
  websearch: false,
  task: false,
  todowrite: false,
  skill: false,
  question: false,
  apply_patch: false,
}

export function buildAgentConfig(options: AgentOptions): Config {
  const labels: Record<string, string> = {
    [MODELS.primary]: "Qwen3.5 4B Abliterated (uncensored)",
    [MODELS.fallback]: "Qwen3 4B",
    [MODELS.codingBaseline]: "Qwen2.5 Coder 3B",
  }
  const models: Record<string, { name: string; tool_call: true }> = {}
  for (const id of MODELS.all) models[id] = { name: labels[id] ?? id, tool_call: true }
  if (options.model.providerID === "ollama" && !(options.model.modelID in models)) {
    models[options.model.modelID] = { name: options.model.modelID, tool_call: true }
  }

  const bash: Record<string, "allow" | "deny"> = { "*": "deny" }
  for (const pattern of BASH_ALLOWLIST) bash[pattern] = "allow"

  const config: Config = {
    $schema: "https://opencode.ai/config.json",
    autoupdate: false,
    share: "disabled",
    mcp: {},
    plugin: [],
    disabled_providers: ["anthropic", "openai", "google", "github-copilot"],
    provider: {
      ollama: {
        npm: "@ai-sdk/openai-compatible",
        name: "Ollama",
        options: { baseURL: options.ollamaBaseUrl },
        models,
      },
    },
    agent: {
      [options.agent]: {
        mode: "primary",
        description: "Builds a reproducible, non-destructive penetration-testing script for one OWASP Top 10:2025 category",
        maxSteps: options.maxSteps,
        tools: TOOLS,
        permission: {
          edit: "allow",
          webfetch: "deny",
          doom_loop: "deny",
          external_directory: "deny",
          bash,
        },
      },
    },
  }
  return { ...config, ...(options.configExtra ?? {}) }
}

export function decidePermission(permission: Permission): "once" | "always" | "reject" {
  if (permission.type === "edit") return "once"
  if (permission.type === "bash") return "once"
  return "reject"
}
