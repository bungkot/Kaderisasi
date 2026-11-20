# Follow-up: Docker stack tuned for the native 8 GB host

Session summary of the follow-up period on the native 8 GB Linux host (2026-11-20).

## Setup changes (host is not WSL2 anymore)

- `docker-compose.override.yml` is now the active override for the native 8 GB
  host stack:
  - Ollama `mem_limit: 4g` (the WSL trial used 2 g; on native Linux the model
    reaches ~3.8–3.9 GiB with the 4B model, so 3.5 g was also tight).
  - Model: `huihui_ai/qwen3.5-abliterated:4B` (the uncensored default) in
    `model-init` and the bench-runner `--models` (trial used
    `qwen2.5:1.5b`).
  - Juice Shop `192m`, `OLLAMA_CONTEXT_LENGTH=8192`, `OLLAMA_KV_CACHE_TYPE=q8_0`,
    `OLLAMA_FLASH_ATTENTION=1` unchanged.
- Harness fix in `agent/src/agent.ts` (`waitForIdle`): the loop now also
  settles on `session.execution.succeeded` as the terminal success signal.
  OpenCode 2.3.2 does not emit `session.idle` in its event stream (verified
  with a debug SSE trace: the session ends with
  `session.execution.succeeded` and no `session.idle`), so the previous
  `agent_timeout` after successful steps was a harness event-handling bug.

## Storage cleanup (host at ~99 % of the data volume)

- Deleted stale unreferenced `*-partial*` blobs in
  `/data/home/kaderisasi/.ollama/models/blobs` (941 MB).
- `docker system prune -f` (removed 4 stopped containers + default network)
  and `docker builder prune -f`: reclaimed ~13.4 MB.
- Remaining usage is the Ollama image (8.5 GB), the 4B model (3.1 GB), the
  Juice Shop image, and the instabox swapfile (4.1 GB); no safe deletions
  left without breaking the stack.

## Verification of the tool-calling gate

- `npx tsx agent/src/index.ts toolcheck --model ollama/huihui_ai/qwen3.5-abliterated:4B
  --ollama-base-url http://127.0.0.1:11434/v1 --timeout-ms 600000`:
  **`ok: true`, `outcome: idle`, tool call `shell({"command":"echo TOOL_OK"})`,
  exit 0, output "TOOL_OK\n"** — with `mem_limit: 3.5g` (18:24) and again with
  `mem_limit: 4g` (18:58).
- Direct OpenAI-compatible probe against `/v1/chat/completions` also showed
  the 4B model emitting `tool_calls` when the prompt explicitly asks it to use
  the tool.

## A05 run with the 30-minute timeout (run #3)

- `npx tsx agent/src/index.ts run --task harness/tasks/A05.json --target
  http://127.0.0.1:3000 --workspace-root ./workspaces --model
  ollama/huihui_ai/qwen3.5-abliterated:4B --ollama-base-url
  http://127.0.0.1:11434/v1 --timeout-ms 1800000 --out
  ./runs/single-run-4b-native-30min.json` — run 19:14:39 → 19:44:45.
- Result (`runs/single-run-4b-native-30min.json`): `status: timeout`,
  `steps: 4`, `toolCalls: 3`, `requests: 1`, `repairRounds: 0`,
  `errors: ["agent_timeout"]`. POST pattern: `500 @19:19:44 (5m0s)` →
  `200 @19:25:32 (5m40s)` → `200 @19:27:15 (1m40s)` → `200 @19:32:47
  (5m30s)` → `200 @19:43:21 (10m30s)` → `500 @19:44:45 (1m20s)`.
- The model actually made deliverables progress: workspace
  `workspaces/A05_huihui_ai-qwen3.5-abliterated-4B_2026-11-20T19-14-40-792Z_f4efc703f881/`
  contains `requirements.txt` (17 B) and `README.md` (1941 B, documents the
  expected scanner CLI and findings.json schema). The transcript shows the
  model mid-way through creating `main.py` ("Now let me create the main.py
  file...") when the 30-min deadline hit. `validateWorkspace` runs only after
  the session goes idle, so no validation/repair could run before the timeout.
- Previous attempt (900 s, 4 g): `status: timeout`, 4 steps, 2 tool calls,
  1 repair round, no deliverables yet. The session ended with a tool call +
  text; the model is CPU-bound on this host (~8–15 tokens/s), so the ~10k
  token OpenCode prompt plus tool rounds take much longer than a 15 min
  budget.
- Note: `Ollama` truncates prompts longer than ~4098 tokens
  ("truncating input prompt limit=4098") — the 4B model effectively sees a
  ~4k-token window per step.

## Current host state

- Ollama: `MemLimit: 4294967296` (4 GiB), ~3.87–3.88 GiB used (~96.8%).
- Juice Shop: healthy, ~96 MB (50 % of 192 MB).
- Host RAM: total 7964 MB, free ~0.9–1.3 GB, available ~2.2 GB, swap mostly
  free. Disk `/data` is ~99 % used by the stack itself.
