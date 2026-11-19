import type { AgentTaskCard } from "@kaderisasi/shared"

function taskCardJson(task: AgentTaskCard): string {
  return JSON.stringify(
    {
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
    },
    null,
    2,
  )
}

function safetyRules(task: AgentTaskCard): string[] {
  return [
    `Only send requests to hosts listed in scope: ${task.scope.join(", ")}.`,
    "Non-destructive only: no DoS, no mass brute-force, no permanent data modification.",
    `Rate limit yourself to at most ${task.estimated_requests} requests for this task.`,
    "Do not acquire credentials, sessions, or personal identity data.",
    "Verify each finding with at least one clean reproduction before reporting it.",
    "Stay inside the workspace directory; never read or write outside it.",
  ]
}

function deliverableSchema(): string {
  return `findings.json must be a JSON array of objects with this exact shape:
{
  "id": "F-001",
  "title": "short description",
  "owasp_id": "A05:2025",
  "severity": "critical | high | medium | low | info",
  "endpoint": "/path",
  "method": "GET | POST | PUT | PATCH | DELETE | OPTIONS | HEAD",
  "evidence": "what was observed, with a minimal reproduction",
  "payload": "optional payload used",
  "confidence": 0.0,
  "remediation": "optional remediation"
}`
}

export function buildPrompt(task: AgentTaskCard, workspace: string, repairErrors: string[] | null): string {
  const sections: string[] = []

  sections.push("/no_think")
  sections.push("You are an autonomous offensive-security automation engineer.")
  sections.push("Your job is to build a complete, runnable Python project that tests exactly one OWASP Top 10:2025 category against the target, then writes reproducible evidence.")
  sections.push("## Task card\n```json\n" + taskCardJson(task) + "\n```")
  sections.push("## Workspace\nAll project files must be created under:\n" + workspace)
  sections.push("## Required deliverables\n" + task.deliverables.join("\n"))

  sections.push(
    [
      "## Project contract",
      "- `main.py` is the CLI entrypoint and must accept `--target <url>` and `--output <file>`.",
      "- `requirements.txt` lists dependencies (prefer the standard library and `requests`).",
      "- `README.md` explains how to run the project and the methodology in brief.",
      "- Exit code 0 on success; write the findings array to the `--output` path.",
    ].join("\n"),
  )

  sections.push("## Findings schema\n" + deliverableSchema())
  sections.push("## Safety rules (mandatory)\n" + safetyRules(task).map((rule) => "- " + rule).join("\n"))

  sections.push(
    [
      "## Self-test before finishing",
      "1. Run `python main.py --target <target> --output findings.json` (or a `--dry-run` if the target is unavailable).",
      "2. Confirm the command exits 0 and `findings.json` is valid JSON matching the schema.",
      "3. Re-run once to confirm the result is reproducible.",
    ].join("\n"),
  )

  if (repairErrors && repairErrors.length > 0) {
    sections.push(
      [
        "## Repair required",
        "The previous attempt failed validation. Fix every item below and re-run the self-test:",
        ...repairErrors.map((error) => "- " + error),
      ].join("\n"),
    )
  }

  sections.push("## Final response\nWhen done, reply with: the list of files created, the number of requests sent, and the number of findings.")

  return sections.join("\n\n")
}
