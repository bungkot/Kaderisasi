import { access, readFile, readdir } from "node:fs/promises"
import { join, resolve, sep } from "node:path"
import { spawn } from "node:child_process"
import { FindingsSchema, type ArtifactPaths, type FileDiffLike } from "@kaderisasi/shared"

export interface ValidationOptions {
  compile?: boolean
  pythonBin?: string
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  artifacts: ArtifactPaths | null
}

const REQUIRED = ["main.py", "findings.json", "requirements.txt", "README.md"] as const

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function compileCheck(mainPy: string, pythonBin: string): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolvePromise) => {
    const proc = spawn(pythonBin, ["-m", "py_compile", mainPy], { stdio: ["ignore", "ignore", "pipe"] })
    let stderr = ""
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    proc.on("error", (err) => resolvePromise({ ok: false, stderr: String(err) }))
    proc.on("close", (code) => resolvePromise({ ok: code === 0, stderr }))
  })
}

export async function validateWorkspace(
  workspace: string,
  opts: ValidationOptions = {},
): Promise<ValidationResult> {
  const errors: string[] = []
  for (const file of REQUIRED) {
    if (!(await exists(join(workspace, file)))) errors.push(`missing:${file}`)
  }

  if (errors.length > 0) return { ok: false, errors, artifacts: null }

  const entries = await readdir(workspace)
  const extra = entries.filter((entry) => !REQUIRED.includes(entry as (typeof REQUIRED)[number]) && !entry.startsWith(".")).sort()

  const artifacts: ArtifactPaths = {
    mainPy: join(workspace, "main.py"),
    findings: join(workspace, "findings.json"),
    requirements: join(workspace, "requirements.txt"),
    readme: join(workspace, "README.md"),
    extra,
  }

  try {
    const raw = await readFile(artifacts.findings, "utf8")
    const parsed: unknown = JSON.parse(raw)
    const result = FindingsSchema.safeParse(parsed)
    if (!result.success) {
      const detail = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
      errors.push(`invalid_findings: ${detail}`)
    }
  } catch (err) {
    errors.push(`invalid_findings: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (opts.compile !== false) {
    const pythonBin = opts.pythonBin ?? "python3"
    const compiled = await compileCheck(artifacts.mainPy, pythonBin)
    if (!compiled.ok) errors.push(`compile: ${compiled.stderr.trim()}`)
  }

  return { ok: errors.length === 0, errors, artifacts }
}

export function detectLeaks(diff: FileDiffLike[], workspace: string): string[] {
  const root = resolve(workspace)
  const leaks: string[] = []
  for (const entry of diff) {
    const target = resolve(entry.file)
    if (target !== root && !target.startsWith(root + sep)) leaks.push(entry.file)
  }
  return leaks
}
