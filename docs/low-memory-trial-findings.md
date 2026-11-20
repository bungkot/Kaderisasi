# Confirmed findings: low-memory Docker Desktop trial

This document records results that were actually observed during the trial
described in [Low-memory Docker trial](./docker-desktop-4gb.md), on 2026-11-20.
It is a single-host experimental record, not a general performance guarantee and
not a change to the repository defaults. The lab target was a local, self-owned
Juice Shop instance; no third-party system was tested. Ground truth was not
placed in the agent input: `AgentTaskCardSchema.parse` strips `ground_truth`, and
the written `task.agent.json` did not contain it.

## Environment in which the results were confirmed

| Component | Observed value |
|---|---|
| Docker Engine / Compose | 29.9.3 / v5.7.0 |
| Docker Desktop VM (WSL2) | `MemTotal` 5,157,531,648 bytes (~4.8 GiB), 4 CPUs |
| WSL configuration | `%USERPROFILE%\.wslconfig`: `memory=5GB`, `swap=6GB` |
| Host disk | ~54.7 GB free on `C:` |
| Node / npm | v26.3.0 / 11.16.0 |
| OpenCode CLI / V2 client | v2.3.2 / `@opencode/client` 2.3.2 |

The trial did not run on a VM capped at exactly 4 GB. The effective cap was
~4.8 GiB because the host `.wslconfig` used 5 GB. This matters when comparing the
memory numbers below with the budget in `docker-desktop-4gb.md`.

## Configuration that was actually applied

`docker compose config --format json` confirmed that the override file was
loaded:

- `OLLAMA_CONTEXT_LENGTH=8192`, `OLLAMA_KV_CACHE_TYPE=q8_0`,
  `OLLAMA_FLASH_ATTENTION=1`
- `mem_limit`: Ollama 2 GiB (`2147483648`), Juice Shop 192 MiB (`201326592`),
  `model-init` 256 MiB
- `model-init` command: `ollama pull qwen2.5:1.5b`

Until the final cleanup, `shared/src/constants.ts` was temporarily set to
`MODELS.primary = "qwen2.5:1.5b"` as the trial guide instructs. It was restored
to the repository default afterwards.

## Confirmed result 1: the reduced stack fits the memory budget

| Check | Result |
|---|---|
| `docker compose up -d ollama juice-shop` | Both containers up; Ollama reported `healthy` |
| Juice Shop HTTP check on `127.0.0.1:3000` | `200`, 3748 bytes |
| `docker compose up model-init` for 1.5b | `success`, exit code 0; 986 MB blob; sha256 verification was slow over the Windows bind mount |
| Ollama idle memory before loading a model | ~325–334 MiB / 2 GiB |
| Ollama memory with `qwen2.5:1.5b` loaded | **1.57 GiB / 2 GiB (78.5%)**, CPU ~193% |
| Juice Shop memory | ~148–158 MiB / 192 MiB (77–82%) |

The model weights plus the 8k `q8_0` KV cache and compute buffers stayed inside
the 2 GiB container limit. Juice Shop ran close to its 192 MiB cap but kept
serving HTTP 200. The memory argument of the low-memory guide is therefore
confirmed for the 1.5b configuration on this host.

## Confirmed result 2: neither small model passes `toolcheck`

`toolcheck` was run from the host with the native `opencode` binary on `PATH`.

| Run | Timeout flag | Outcome | `ok` | Tool calls | Observed text |
|---|---|---|---|---|---|
| `qwen2.5:1.5b` | default 120 s | `error` / `agent_timeout` | false | none | empty |
| `qwen2.5:1.5b` | `--timeout-ms 600000` | `idle` | false | none | `echo TOOL_OK` + `DONE` |
| `qwen2.5:3b` | `--timeout-ms 600000` | `idle` | false | none | empty |

The first failure was a timeout during prompt processing, not a model answer:
Ollama logged `POST /v1/chat/completions` returning 500 after 1m50s, with
`task.n_tokens = 3913` and prompt processing at about **23 tokens/s** on CPU
(1024 tokens in 44.59 s). At that rate the ~3.9k-token OpenCode prompt needs
roughly 170 s, so the 120 s default cannot work in this environment. The
`--timeout-ms` CLI option removes that particular blocker.

With a longer timeout both models reached `idle` but emitted no `bash`/`shell`
tool call. The 1.5b model only echoed the command text from the prompt. This is
the failure mode the trial guide warns about; `capabilities: { tools: true }`
did not translate into a tool call in this loop.

## Confirmed result 3: the 3b / 3g remediation exceeded this host

Following the guide's "If it fails" suggestion, a supplemental override set
Ollama `mem_limit: 3g` and pulled `qwen2.5:3b` (1.9 GB, exit code 0). `toolcheck`
still reported `idle` with no tool call. After that run, **both**
`kaderisasi-ollama` and `kaderisasi-juice-shop` exited with code 255, which is
consistent with a WSL2 restart caused by memory pressure on this ~4.8 GiB VM.
Returning to the documented 2 GiB Ollama limit restored a healthy stack.

The 3b / 3g fallback should therefore not be treated as a safe remedy on a host
of this size. Reducing `OLLAMA_CONTEXT_LENGTH` to 4096 or increasing the VM
allocation is required first.

## Confirmed result 4: the 1.5b model is capable of tool calling with explicit phrasing

A direct OpenAI-compatible request to `http://127.0.0.1:11434/v1/chat/completions`
with a single `bash` tool definition produced:

- A plain prompt ("Run this exact shell command once: echo TOOL_OK. Do not run it
  again."): no `tool_calls`, empty content.
- An explicit prompt ("Use the bash tool to run echo TOOL_OK. You must call the
  tool."): `finish_reason: tool_calls`, with
  `bash({"command":"echo TOOL_OK"})`.

A minimal completion probe ("Reply with exactly: PONG") returned `PONG` in 7.2 s.
Ollama and the OpenAI-compatible endpoint were therefore working. The gate
failure is best explained by the fixed `toolcheck` prompt combined with the
limited instruction-following of these small models, not by a dead endpoint.
This does not prove that either model would pass the benchmark loop.

## Confirmed result 5: a diagnostic task run did not complete

Because `toolcheck` never returned `ok: true`, a full task run is outside the
trial guide's gate. One run was still executed as a diagnostic only, with
`--timeout-ms 900000`, against the local Juice Shop A05 card. Its result must not
be read as a model-quality measurement.

| Field | Value |
|---|---|
| `status` | `timeout` |
| `durationMs` | 905,363 |
| `requests` / `steps` / `repairRounds` | 1 / 1 / 0 |
| `toolCalls` | 0 |
| `artifacts` / `diff` | `null` / empty |
| `errors` | `agent_timeout` |
| Usage | input 265, output 316, cacheRead 5125 |

The transcript contains an assistant message that lists `main.py`,
`findings.json`, `requirements.txt`, and `README.md` as created, but the
workspace contained only `task.agent.json`. No files were written through tools.
The transcript also contains an `idle` message while the loop still reported
`agent_timeout`; this is an observation to investigate in the session-wait or
event-handling path, not a proven root cause.

## Confirmed result 6: host tooling prerequisites on Windows

Two host-side issues had to be resolved before the agent could run:

1. `@opencode/client` was declared in the lockfile but missing from
   `node_modules`, so `npm run typecheck` failed with `TS2307: Cannot find module
   '@opencode/client'`. `npm install` fixed it. After that,
   `npm run typecheck` and `npm test` passed (17 tests: 6 shared, 7 agent,
   4 harness).
2. Node's `spawn("opencode", ...)` failed with `ENOENT` on Windows because the
   global shims are `opencode.cmd` / `opencode.ps1`. Prepending the directory of
   the native executable to `PATH` for the process fixed it without a source
   change:

   ```powershell
   $env:PATH = "$env:APPDATA\npm\node_modules\@opencode\cli\bin;$env:PATH"
   ```

## Interpretation and implications for further research

1. **Memory is no longer the first blocker.** With 1.5b at 8k context and `q8_0`
   KV, the Ollama container stayed at ~1.57/2 GiB and the stack was healthy.
2. **Tool invocation is the blocker.** `ok: true` from `toolcheck` is a
   prerequisite for any model-quality experiment, and neither candidate model
   achieved it in this environment.
3. **Separate prompt sensitivity from capability.** The direct probe shows that
   the 1.5b model can emit a `bash` call when told explicitly to do so. Future
   work should test whether a stronger `toolcheck` prompt or a different agent
   instruction changes the gate result, while keeping the fixed gate as the
   reference measurement.
4. **Do not raise the 3b limit on this VM.** A 3 GiB Ollama container restarted
   WSL on this host. Prefer a smaller context window, a smaller KV cache, or a
   larger VM allocation.
5. **Treat the reported timeout as a harness observation.** The idle message in
   the transcript alongside `agent_timeout` suggests that session-wait handling
   needs its own investigation before run durations are compared across models.
6. **Keep the authorization boundary.** All experiments used a local,
   self-owned Juice Shop and non-destructive task scope; ground truth stayed out
   of agent inputs.

## Reproduction checklist

```bash
# From the repository root, with the override file present
npm install
docker compose up -d ollama juice-shop
docker compose up model-init
docker compose ps

# On Windows, put the native opencode.exe directory on PATH first
npx tsx agent/src/index.ts toolcheck \
  --model ollama/qwen2.5:1.5b \
  --ollama-base-url http://127.0.0.1:11434/v1 \
  --timeout-ms 600000

# Only if toolcheck reports ok: true
npx tsx agent/src/index.ts run \
  --task harness/tasks/A05.json \
  --target http://127.0.0.1:3000 \
  --workspace-root ./workspaces \
  --model ollama/qwen2.5:1.5b \
  --ollama-base-url http://127.0.0.1:11434/v1 \
  --out ./runs/single-run.json
```

## What is not proven

- No score, finding count, or successful script was produced; the harness was
  not evaluated on this stack.
- No model larger than 3b was tested, and the default 4B model was not loaded.
- The exact VM memory ceiling at which the 3b configuration stops crashing was
  not determined.
- The cause of the idle/timeout mismatch was not isolated in the source.
- These results describe one Windows/WSL2 host and may differ on other machines.
