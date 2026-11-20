# Agentic Pentest Benchmark

This research project measures a local coding agent built with **TypeScript**,
the **OpenCode V2 client**, and **Ollama** as it generates a Python project for
OWASP Top 10:2025 tasks in a per-run workspace. The harness compares the output
with task ground truth and builds experiment summaries. The provided target is
OWASP Juice Shop for authorized lab testing.

> Use this project only against systems you own or systems you are explicitly
> authorized to test. Prompts, tool allowlists, and evaluator checks are not a
> network or operating-system sandbox. Review generated scripts before running
> them outside the experiment workspace.

## Documentation map

- [Documentation and architecture](./docs/README.md)
- [Agent runtime and security boundaries](./docs/agent-runtime.md)
- [Evaluation methodology and limitations](./docs/evaluation.md)
- [Local operations and Docker Compose](./docs/operations.md)
- [Artifacts and reports](./docs/reporting.md)
- [Conventions for coding agents](./AGENTS.md)
- [License](./LICENSE)

## Repository layout

```text
shared/src/   shared types, schemas, constants, and utilities
agent/src/    OpenCode V2 client, prompts, agent lifecycle, workspace validation
harness/src/  orchestration, evaluation, aggregation, metrics, and reports
harness/tasks/ OWASP A01–A10 tasks and evaluator ground truth
docs/         architecture, operations, evaluation, and system contracts
opencode.json       V2 configuration for interactive use
agent/opencode.agent.json  companion V2 configuration for the benchmark agent
```

## Prerequisites

- Node.js 22+, npm, and Python 3.
- `opencode` CLI v2 on `PATH` (tested with v2.3.2).
- Ollama with the `huihui_ai/qwen3.5-abliterated:4B` model.
- Docker Compose is optional, for a local Ollama and Juice Shop stack.

Install dependencies and verify the repository:

```bash
npm install
npm run typecheck
npm test
npm run build
```

At the time of writing, `typecheck` and all tests pass (6 + 7 + 4 tests).

## Model and reasoning

Active model: `ollama/huihui_ai/qwen3.5-abliterated:4B`. It is the only model
currently installed; the data partition has limited free space, so a smaller
model has not been pulled.

Qwen3 reasoning is disabled through the OpenAI-compatible field
`reasoning_effort: "none"`. This field only works with the V2 configuration
shape (`providers`, not the V1 `provider`) and is injected via:

```jsonc
"providers": {
  "ollama": {
    "package": "@opencode/ai/providers/openai-compatible",
    "settings": { "baseURL": "http://127.0.0.1:11434/v1" },
    "body": { "reasoning_effort": "none" }
  }
}
```

Experimental evidence: a logging proxy showed this field in OpenCode's
`/v1/chat/completions` requests, including requests that carry tool
definitions. In a direct streaming test, the reasoning output length was `0`
and the `bash` tool call was still emitted. The repository `toolcheck` also
passed (`echo TOOL_OK` → `TOOL_OK`, followed by `DONE`).

## OpenCode V2 integration

- Dependencies: `@opencode/client@2.3.2` and `opencode` CLI 2.3.2. The legacy
  `@opencode-ai/sdk@1.19.6` package has been removed.
- The embedded `@opencode/sdk` client is not used because it requires Node 24+
  (`await using`), while this repository runs on Node 22.
- Each run spawns `opencode serve --port=0` with isolated `HOME`, `XDG_*`,
  `OPENCODE_CONFIG_CONTENT`, and `OPENCODE_PASSWORD` values.
- Per-run configuration is built by `buildAgentConfig` in
  `agent/src/permission.ts` using the V2 shape: `providers`, `agents`,
  `policies`, and `permissions`.
- V1-to-V2 safety mapping: `bash` → `shell`, `task` → `subagent`,
  `permission` → `permissions`, and `tool_call` → `capabilities.tools`.
  `external_directory`, `webfetch`, `websearch`, `subagent`, `skill`, and
  `question` are denied. The V1 `doom_loop` restriction cannot be enforced
  because V2 has no such permission action.

## Preparing the lab target

With Docker Compose:

```bash
docker compose up -d ollama juice-shop
docker compose up model-init
docker compose ps
```

Juice Shop is published at `http://127.0.0.1:3000`. Use only authorized lab
targets.

## Running a single task

Run commands from the repository root so relative paths resolve consistently:

```bash
npx tsx agent/src/index.ts toolcheck \
  --model ollama/huihui_ai/qwen3.5-abliterated:4B \
  --ollama-base-url http://127.0.0.1:11434/v1

npx tsx agent/src/index.ts run \
  --task harness/tasks/A05.json \
  --target http://127.0.0.1:3000 \
  --workspace-root /data/home/kaderisasi/workspaces \
  --model ollama/huihui_ai/qwen3.5-abliterated:4B \
  --ollama-base-url http://127.0.0.1:11434/v1 \
  --out ./runs/single-run.json
```

The V2 API requires an absolute `location.directory`; `executeTask` now
resolves `workspaceRoot` before creating the session.

## Running the benchmark

```bash
npx tsx harness/src/index.ts verify --tasks ./harness/tasks

npx tsx harness/src/index.ts run \
  --tasks ./harness/tasks \
  --models ollama/huihui_ai/qwen3.5-abliterated:4B \
  --runs 1 \
  --target http://127.0.0.1:3000 \
  --seed 42 \
  --out ./runs \
  --ollama-base-url http://127.0.0.1:11434/v1 \
  --workspace-root /data/home/kaderisasi/workspaces
```

The harness uses `ollama/<model-id>` so the provider prefix can be parsed
correctly. For namespaced models, use `ollama/<namespace>/<model>:<tag>`.

Regenerate the report from existing results:

```bash
npx tsx harness/src/index.ts report \
  --results ./runs/results.jsonl \
  --out ./runs/report \
  --seed 42 \
  --target http://127.0.0.1:3000
```

## Running the harness with Docker Compose

The `harness` service is in the `bench` profile:

```bash
docker compose --profile bench build harness
docker compose --profile bench up --abort-on-container-exit --exit-code-from harness harness
```

The runner image does not install the `opencode` CLI because of disk quota
limits during the build. The host binary is mounted at
`/usr/local/bin/opencode`; the path can be changed with `OPENCODE_BIN`:

```bash
OPENCODE_BIN=/path/to/opencode docker compose --profile bench up --profile bench harness
```

Fixes already applied to the Docker path:

- CLI options `--tasks` and `--out` are mapped to `tasksDir` and `outDir`.
- `--workspace-root` uses the absolute path `/app/harness/workspaces`.
- `executeTask` resolves the workspace to an absolute path before
  `session.create`.

With these fixes, the HTTP 500 errors are gone and runs reach the agent loop.
In a full 10-task run, each run still hit the 15-minute limit because CPU-only
4B inference did not complete generation; no `main.py` was produced. Restart
Ollama before retrying if abandoned generations are still occupying its single
slot (`docker restart kaderisasi-ollama`).

## Verified minimal configuration

To demonstrate that script generation works, the following minimal setup was
used (this is not the default benchmark configuration):

- the same `huihui_ai/qwen3.5-abliterated:4B` model, with reasoning disabled via
  `body.reasoning_effort: "none"`;
- only `write`/`edit` and `read` tools available; `shell`, `webfetch`,
  `websearch`, `subagent`, `skill`, `question`, `external_directory`, `glob`,
  and `grep` denied;
- the workspace placed under `/tmp` so repository `AGENTS.md` files are not
  inherited;
- a one-paragraph prompt starting with `/no_think`, requesting four files and
  ending with `Reply DONE`.

Summary of results:

- without a token cap: a complete four-file project was generated in about
  five minutes at `/data/tmp/kaderisasi-mini-uxRvkg`;
- with `max_completion_tokens: 512`: completed in about 146 seconds, but the
  fourth file was truncated;
- with `max_completion_tokens: 1024` and a longer prompt: still timed out after
  six minutes.

Generated files: `main.py` (argparse `--target`/`--output`, urllib, writes a
JSON array), `findings.json` (`[]`), `requirements.txt` (empty), and
`README.md`. `python3 -m py_compile main.py` passes. This is a minimal
baseline, not a complete A01 detection implementation: `main.py` fetches the
target URL and writes a JSON array, so it must be extended before being used as
a full penetration-test script.

## Status and claim boundaries

- The agent, harness, task suite, aggregation, and report renderer are
  implemented.
- Tool calling and `reasoning_effort` injection are verified.
- Full generation for an OWASP task did not finish within 15 minutes on the
  CPU-only 4B model; most existing benchmark results are `timeout`/`error` and
  must not be interpreted as model performance scores.
- Safety evaluation is heuristic and does not monitor all traffic or provide
  comprehensive process isolation. Scores are not security certifications.
  See the [evaluation document](./docs/evaluation.md).

## License

This project is distributed under the MIT License. See [LICENSE](./LICENSE).
