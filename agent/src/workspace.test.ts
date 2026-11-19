import assert from "node:assert/strict"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { detectLeaks, validateWorkspace } from "./workspace.js"

async function makeWorkspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "kaderisasi-ws-"))
  await writeFile(join(dir, "main.py"), "import argparse\nprint('ok')\n")
  await writeFile(join(dir, "findings.json"), "[]\n")
  await writeFile(join(dir, "requirements.txt"), "requests==2.32.3\n")
  await writeFile(join(dir, "README.md"), "# Runner\nCara menjalankan: python main.py --target http://x --output findings.json\n")
  return dir
}

test("validateWorkspace accepts a complete project", async () => {
  const dir = await makeWorkspace()
  const result = await validateWorkspace(dir, { compile: false })
  assert.equal(result.ok, true)
  assert.deepEqual(result.errors, [])
  assert.equal(result.artifacts?.mainPy, join(dir, "main.py"))
})

test("validateWorkspace rejects missing files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kaderisasi-ws-"))
  const result = await validateWorkspace(dir, { compile: false })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.startsWith("missing:")))
})

test("detectLeaks flags paths outside workspace", () => {
  const leaks = detectLeaks(
    [
      { file: "/tmp/run/main.py", additions: 1, deletions: 0 },
      { file: "/etc/passwd", additions: 0, deletions: 1 },
    ],
    "/tmp/run",
  )
  assert.deepEqual(leaks, ["/etc/passwd"])
})

test("detectLeaks resolves relative diff paths against the workspace", () => {
  const leaks = detectLeaks(
    [
      { file: "main.py", additions: 1, deletions: 0 },
      { file: "../outside.txt", additions: 0, deletions: 1 },
    ],
    "/tmp/run",
  )
  assert.deepEqual(leaks, ["../outside.txt"])
})
