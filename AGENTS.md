# Repository coding agent instructions

## Purpose and scope

This repository contains a TypeScript coding agent built on the OpenCode V2
client and Ollama. It generates Python script projects for OWASP Top 10:2025
tasks in experimental workspaces, together with an evaluation harness.

Every change and test example must preserve the authorized-use boundary: lab
targets you own or targets you are explicitly allowed to test, narrow scope,
and non-destructive activity. Do not add features for DoS, credential
harvesting, persistence, detection evasion, exfiltration, or execution outside
the workspace. Never describe prompts or tool configuration as a network/OS
sandbox.

Ground truth in `harness/tasks/*.json` is for the evaluator only. Never place
ground truth in prompts or agent input files; use `stripGroundTruth`. Changes
to safety behavior must preserve the existing hard gates and document any
limits that are not enforced.

## Structure and responsibilities

- All TypeScript code lives in the `src/` directory of its workspace.
- `shared/`: cross-workspace types, schemas, constants, and utilities.
- `agent/`: OpenCode V2 client, agent configuration, prompts, single-run
  lifecycle, workspace validation, events, and metering.
- `harness/`: task loading, orchestration, evaluation, aggregation, metrics,
  and reports.
- The harness is the source of benchmark metadata such as `run.json`,
  `evaluation.json`, `results.jsonl`, and `summary.json`.

Official documentation starts at `docs/README.md`. Update related documents
when contracts, CLI behavior, schemas, or outputs change; remove stale design
claims that no longer match the implementation.

## Style

- TypeScript ESM, NodeNext, strict mode, and `verbatimModuleSyntax`.
- Use `import type` for imports used only as types.
- Code identifiers are in English; documentation and reports are in English.
- Follow existing formatting and patterns; do not add comments unless they
  explain non-obvious logic.
- Do not store secrets, tokens, credentials, or sensitive data in the
  repository, transcripts, or logs.

## OpenCode client

- The repository uses the V2 client `@opencode/client` with an OpenCode 2
  server; `client.event.subscribe` is an SSE async iterable. The embedded
  `@opencode/sdk` client is not used because it requires Node 24+
  (`await using`).
- V2 client responses contain values directly, without a `.data` wrapper.
- The benchmark uses the `pentest-builder` agent, not the `build` agent.
- Per-run configuration is built in `agent/src/permission.ts` using the V2
  shape (`providers`, `agents`, `policies`, `permissions`) and includes
  `body.reasoning_effort: "none"`. If `agent/opencode.agent.json` changes, do
  not claim that this static file replaces the runtime configuration.

## Verification before finishing

Run both commands for code changes:

```bash
npm run typecheck
npm test
```

Run `npm run build` before building a Docker image. For documentation-only
changes, verify that links and commands remain consistent with the current CLI
and implementation.
