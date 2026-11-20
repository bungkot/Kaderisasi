# Trial stack on Docker Desktop with less than 4 GB

This is an **experimental local configuration**, not the repository default. It
trades model capability for memory so the stack can run when Docker Desktop is
limited to about 4 GB. Keep the lab target scoped to a local, self-owned Juice
Shop instance and follow the same authorization boundary as the rest of the
project.

## Why the default does not fit

With `huihui_ai/qwen3.5-abliterated:4B` and `OLLAMA_CONTEXT_LENGTH=16384`, the
`ollama` container was measured at **4.12 GiB** while idle with the model loaded.
Juice Shop adds about 0.1 GiB and the Docker Desktop VM itself needs roughly
0.5-1 GiB. The 4 GB slider is therefore exhausted before the agent starts.

The memory budget for a 4 GiB VM is:

```
4096 MiB
- 512-1024 MiB  Docker Desktop VM overhead
-  100 MiB      Juice Shop
-  450 MiB      Ollama runtime and compute buffers
= 2500-3100 MiB  available for model weights + KV cache
```

Using a smaller model is only sufficient when **weights + KV cache** stay inside
that budget. Some small models have a large KV cache because they use many KV
heads, so file size alone is not a reliable indicator.

| Model | Weights | KV at 16k (f16) | Verdict at 4 GB |
|---|---|---|---|
| `qwen2.5:1.5b` | 0.92 GiB | ~0.44 GiB | fits with room to spare |
| `qwen2.5:3b` | 1.80 GiB | ~0.56 GiB | fits, but tight |
| `qwen3:1.7b` | 1.27 GiB | ~1.75 GiB | needs 8k context or `q8_0` KV |
| `llama3.2:3b` | 1.88 GiB | ~1.75 GiB | needs 4k-8k context |
| current 4B model | 3.09 GiB | ~0.5 GiB | does not fit |

## Prerequisites

- Set the Docker Desktop memory slider to 4 GB. On Windows with WSL2, also set
  `memory=4GB` in `%USERPROFILE%\.wslconfig` and restart WSL.
- Free at least 16-20 GB of disk. Images, the current model, build cache, and
  the trial model share the same disk.
- Run the agent and Node tooling from the host, not inside a container. The
  `bench` profile is not part of this trial.

## Configuration

`docker-compose.override.yml` at the repository root is included for this
trial. Docker Compose loads it automatically, so all `docker compose` commands
below use the reduced limits and the smaller model. It sets:

- `OLLAMA_CONTEXT_LENGTH=8192` instead of `16384`
- `OLLAMA_KV_CACHE_TYPE=q8_0` to halve the KV cache
- `OLLAMA_FLASH_ATTENTION=1`
- `mem_limit: 2g` for Ollama, `256m` for `model-init`, and `192m` for Juice Shop
- `ollama pull qwen2.5:1.5b` in `model-init`

The override also changes the `harness` command to keep its `--models` value
consistent, but the `bench` profile should still be avoided during this trial.

Change the default model in `shared/src/constants.ts` as well so host-side
commands that rely on `MODELS.primary` use the same model:

```ts
export const MODELS = {
  primary: "qwen2.5:1.5b",
  all: ["qwen2.5:1.5b"],
} as const
```

## Steps

```bash
docker compose up -d ollama juice-shop
docker compose up model-init
docker compose ps

npx tsx agent/src/index.ts toolcheck \
  --model ollama/qwen2.5:1.5b \
  --ollama-base-url http://127.0.0.1:11434/v1
```

Only after `toolcheck` reports `ok: true`, run one task from the host:

```bash
npx tsx agent/src/index.ts run \
  --task harness/tasks/A05.json \
  --target http://127.0.0.1:3000 \
  --workspace-root ./workspaces \
  --model ollama/qwen2.5:1.5b \
  --ollama-base-url http://127.0.0.1:11434/v1 \
  --out ./runs/single-run.json
```

## Confirmed trial outcome (2026-11-20)

This trial was executed on a Windows/WSL2 host whose effective Docker VM cap was
about 4.8 GiB, not exactly 4 GB. The 1.5b stack was stable and fit the documented
memory limits, but `toolcheck` did not report `ok: true` for either
`qwen2.5:1.5b` or `qwen2.5:3b`: no tool call was emitted. The 3b /
`mem_limit: 3g` fallback restarted WSL on this host. A diagnostic run of A05
timed out with zero tool calls and no deliverables; it is not a model-quality
result. See [Low-memory trial findings](./low-memory-trial-findings.md) for the
measurements, logs, and reproduction steps.

## If it fails

- `toolcheck` fails or the agent loops without emitting tool calls: the model
  is too small for this loop. Try `qwen2.5:3b` with Ollama `mem_limit: 3g`.
  Confirmed on the test host: this fallback also failed `toolcheck` and caused a
  WSL restart, so do not use it below ~5 GB without first lowering
  `OLLAMA_CONTEXT_LENGTH`.
- Ollama is killed while loading: lower `OLLAMA_CONTEXT_LENGTH` to `4096`, or
  confirm the 4 GB limit is actually applied to the Docker Desktop VM.
- Pull fails with `no space left on device`: remove unused images and old
  models first; a partial download is not a valid model.

A capability declaration such as `capabilities: { tools: true }` in
`agent/src/permission.ts` does not guarantee tool calling. Always verify with
`toolcheck` before interpreting a run as a model-quality result.

## Restoring the default

Delete `docker-compose.override.yml`, revert `shared/src/constants.ts`, and
restore the original model with `docker compose up model-init`. A stale override
file silently changes every later `docker compose` command.
