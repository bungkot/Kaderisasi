# Operations and reproducibility

## Prerequisites

- Node.js 22 or newer and npm.
- The `opencode` CLI callable from `PATH` to run the agent.
- Ollama with the selected model available.
- Python 3 for syntax validation of `main.py`.
- Docker Compose is only needed for the local stack provided by the project.

The active model in `shared/src/constants.ts` is
`huihui_ai/qwen3.5-abliterated:4B`. Ensure the model is capable of tool calling
with the `toolcheck` command; the `capabilities.tools` declaration in the config
does not guarantee the model's ability.

## Installation and checks

```bash
npm install
npm run typecheck
npm test
npm run build
```

For code changes, typecheck and test are required checks. The build is also run
before building a Docker image.

## Verifying tool calling

```bash
npx tsx agent/src/index.ts toolcheck \
  --model ollama/huihui_ai/qwen3.5-abliterated:4B \
  --ollama-base-url http://127.0.0.1:11434/v1
```

The command returns `ok: true` if a tool call is detected. This is not a test of
model security or accuracy.

## Running a single task

Run a self-managed lab target, for example a local Juice Shop:

```bash
npx tsx agent/src/index.ts run \
  --task harness/tasks/A05.json \
  --target http://127.0.0.1:3000 \
  --workspace-root ./workspaces \
  --model ollama/huihui_ai/qwen3.5-abliterated:4B \
  --ollama-base-url http://127.0.0.1:11434/v1 \
  --out ./runs/single-run.json
```

`--target` overrides the task target and restricts the scope field to that
URL's origin. The agent produces a workspace under `workspaces/`; the `--out`
file stores the run result, not the evaluation harness.

To review the config built per run:

```bash
npx tsx agent/src/index.ts config --model ollama/huihui_ai/qwen3.5-abliterated:4B
```

## Running the benchmark

Ensure Ollama and the lab target are accessible from the harness process. The
model value must use the form `ollama/<model-id>`; the provider prefix is needed
so the parser does not misinterpret model IDs that have a namespace.

```bash
npx tsx harness/src/index.ts verify --tasks ./harness/tasks

npx tsx harness/src/index.ts run \
  --tasks ./harness/tasks \
  --models ollama/huihui_ai/qwen3.5-abliterated:4B \
  --runs 5 \
  --target http://127.0.0.1:3000 \
  --seed 42 \
  --out ./runs \
  --ollama-base-url http://127.0.0.1:11434/v1 \
  --workspace-root ./workspaces
```

Namespaced Hugging Face model names, if used, must be written as
`ollama/<namespace>/<model>:<tag>`. Adjust the model list to the models actually
available in Ollama.

Root script alternative:

```bash
npm run dev:harness -- run --tasks ./tasks \
  --models ollama/huihui_ai/qwen3.5-abliterated:4B --runs 1 \
  --target http://127.0.0.1:3000
```

The workspace script runs from the `harness/` directory; relative paths in
those commands are relative to that directory.

## Docker Compose

`docker-compose.yml` defines Ollama, the `model-init` process, Juice Shop
v17.1.0, and the `harness` service in the `bench` profile. To start the base
services:

```bash
docker compose up -d ollama juice-shop
docker compose up model-init
docker compose ps
```

Ollama data is stored in the project's `.ollama/` directory; models are in
`.ollama/models/`. These directories are ignored by Git.

The `harness` service is available in the `bench` profile. The image built by
the `Dockerfile` does not install the `opencode` CLI; instead, the host binary
is mounted via `OPENCODE_BIN`, so the service is runnable. However, full
15-minute runs timed out on CPU inference. For a local benchmark, run the
harness from a host that has `opencode` on `PATH`:

```bash
npx tsx harness/src/index.ts run \
  --tasks ./harness/tasks \
  --models ollama/huihui_ai/qwen3.5-abliterated:4B \
  --runs 1 \
  --target http://127.0.0.1:3000 \
  --ollama-base-url http://127.0.0.1:11434/v1
```

This stack is a single-host development configuration, not guaranteed network
isolation. Ollama port `11434` and Juice Shop port `3000` are published to the
host; the Ollama image uses the `latest` tag; the target is not automatically
reset to its initial state for each run. Do not expose the stack to untrusted
networks. If the `harness` service is run in a container with the CLI provided,
also verify that the services can reach each other over the Compose network and
that the output volume matches the run configuration.

## Seed, timing, and artifacts

Record the `--seed`, model list, target, number of runs, and configuration
changes for each experiment. The seed controls task order and bootstrapping, but
does not make model inference deterministic. All failures must be preserved and
reported alongside successful runs.

The benchmark result structure is summarized in [Pelaporan](./reporting.md).
