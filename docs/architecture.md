# System architecture

## Goals

The system runs one coding agent per run. The agent receives a task card without
ground truth, creates a Python project in the run workspace, then returns
execution metadata. The harness validates artifacts, compares findings against
private ground truth, and stores results for analysis.

## Workspace boundaries

| Workspace | Responsibility |
|---|---|
| `shared/` | Types, Zod schemas, constants, and utilities shared across workspaces |
| `agent/` | OpenCode V2 client, agent configuration, prompts, event stream, run lifecycle, workspace validation, and usage |
| `harness/` | Task loader, orchestration, evaluation, statistics aggregation, metrics, and reports |

TypeScript code resides in each workspace's `src/`. `harness/tasks/` stores task
cards along with ground truth; `shared/src/util.ts` provides `stripGroundTruth`,
which the runner uses before handing the task to the agent.

## Single-run flow

```text
harness/tasks/*.json
       │ load + schema validation
       ▼
harness runner ── stripGroundTruth + target/scope
       │
       ▼
agent ── prompt ── OpenCode 2 server / V2 client ── Ollama
       │                    │
       │                    ├─ tools operate on the run workspace
       │                    └─ SSE event stream + experimental session wait
       ▼
main.py, findings.json, requirements.txt, README.md
       │
       ├─ file checks, findings schema, main.py compilation
       ├─ repair prompts up to the configured limit
       └─ transcript, usage, session diff
       ▼
harness ── run.json + evaluation.json + results.jsonl
       │
       └─ summary.json + metrics.txt + report/index.html
```

`agent/src/loop.ts` manages a single run and repair. `agent/src/agent.ts` wraps
the V2 client and event stream. `harness/src/runner.ts` is the boundary between the
secret task and agent input; `harness/src/evaluate.ts` and
`harness/src/aggregate.ts` handle scoring and aggregation.

## Data contract

- Task input is validated using `TaskDefinitionSchema`.
- The agent receives `AgentTaskCard`, not `ground_truth`.
- Output findings follow `FindingsSchema`.
- `RunResult` contains status, usage, duration, diff, errors, and artifact paths.
- The harness stores per-run results and one `{ run, evaluation }` line in
  `results.jsonl`.

Shared schemas and types reside in `shared/src/schema.ts` and
`shared/src/types.ts`. The output file structure and how to generate reports are
described in [Reporting](./reporting.md).

## Architectural decisions to preserve

1. The agent handles only a single run; evaluation and aggregation remain the
   harness's responsibility.
2. Ground truth must not enter the prompt, input transcript, or agent workspace
   artifacts.
3. The identity of experiment results comes from `RunResult` and harness
   evaluation, not from model text claims.
4. The benchmark OpenCode configuration is built per run by
   `agent/src/permission.ts`; `agent/opencode.agent.json` is a companion
   configuration, not the source of dynamic configuration.
5. All targets must be within an authorized lab scope. Prompts and OpenCode
   permissions are not a substitute for network isolation or a sandbox.
