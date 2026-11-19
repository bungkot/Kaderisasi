import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { createHash, randomUUID } from "node:crypto"
import type { AgentTaskCard, TaskDefinition } from "./types.js"

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}

export function shortUuid(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12)
}

export function makeRunId(model: string, taskId: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  return `${taskId}_${sanitizeModel(model)}_${stamp}_${shortUuid()}`
}

export function sanitizeModel(model: string): string {
  return model.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-")
}

export function nowIso(): string {
  return new Date().toISOString()
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

export async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8")
  return JSON.parse(raw) as T
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path))
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

export async function appendJsonl(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path))
  await appendFile(path, `${JSON.stringify(value)}\n`, "utf8")
}

export function stripGroundTruth(task: TaskDefinition): AgentTaskCard {
  return {
    id: task.id,
    owasp_id: task.owasp_id,
    title: task.title,
    category: task.category,
    target: task.target,
    scope: task.scope,
    objective: task.objective,
    constraints: task.constraints,
    deliverables: task.deliverables,
    estimated_requests: task.estimated_requests,
  }
}

export function canonicalEndpoint(endpoint: string): string {
  let path = endpoint.trim()
  try {
    const url = new URL(path)
    path = url.pathname
  } catch {
    // not an absolute URL; treat as a path
  }
  path = path.split(/[?#]/, 1)[0] ?? ""
  path = path.replace(/\/+/g, "/")
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)
  return path.toLowerCase()
}

export function canonicalType(type: string): string {
  return type.trim().toLowerCase().replace(/[\s-]+/g, "_")
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 0x1_0000_0000
  }
}

export function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items]
  const next = seededRandom(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export function resolvePath(path: string): string {
  return resolve(path)
}
