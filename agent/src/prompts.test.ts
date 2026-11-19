import assert from "node:assert/strict"
import { test } from "node:test"
import type { AgentTaskCard } from "@kaderisasi/shared"
import { buildPrompt } from "./prompts.js"

const task: AgentTaskCard = {
  id: "A05",
  owasp_id: "A05:2025",
  title: "Injection",
  category: "Injection",
  target: "http://target.test:3000",
  scope: ["http://target.test:3000"],
  objective: "Buktikan SQLi",
  constraints: ["non-destruktif"],
  deliverables: ["main.py", "findings.json", "requirements.txt", "README.md"],
  estimated_requests: 40,
}

test("buildPrompt includes task card and safety rules", () => {
  const prompt = buildPrompt(task, "/tmp/workspace", null)
  assert.match(prompt, /A05:2025/)
  assert.match(prompt, /Non-destructive only/)
  assert.match(prompt, /findings\.json/)
  assert.doesNotMatch(prompt, /Repair required/)
})

test("buildPrompt appends repair errors", () => {
  const prompt = buildPrompt(task, "/tmp/workspace", ["missing:main.py"])
  assert.match(prompt, /Repair required/)
  assert.match(prompt, /missing:main\.py/)
})
