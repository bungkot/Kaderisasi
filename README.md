# Agentic Pentest Benchmark

Coding agent otonom berbasis **TypeScript · OpenCode SDK · Ollama** yang menghasilkan proyek script penetration-testing Python untuk satu kategori OWASP Top 10:2025, lalu dievaluasi secara ilmiah oleh harness.

## Arsitektur

```
harness (orchestrator, evaluator, statistik, report)
   │  executeTask()
   ▼
agent (OpenCodeAgent: server + session + SSE/repair loop)
   │  @opencode-ai/sdk
   ▼
opencode serve ──▶ Ollama (OpenAI-compatible /v1)
   │
   ▼
workspace per run ──▶ evaluator ──▶ results.jsonl ──▶ summary.json ──▶ report/index.html
```

Semua kode TypeScript berada di direktori `src/` tiap workspace:

| Workspace | Isi `src/` |
|---|---|
| `shared/` | tipe, zod schema, konstanta scoring, utilitas deterministik |
| `agent/` | `agent.ts`, `loop.ts`, `prompts.ts`, `permission.ts`, `metering.ts`, `events.ts`, `workspace.ts`, `index.ts`, `lib.ts` |
| `harness/` | `orchestrator.ts`, `runner.ts`, `evaluate.ts`, `groundtruth.ts`, `aggregate.ts`, `report.ts`, `metrics.ts`, `index.ts` |

Config OpenCode per run dibangun di `agent/src/permission.ts` (`buildAgentConfig`), bukan disimpan sebagai file statis; template-nya ada di `agent/opencode.agent.json`.

## Prasyarat

- Node.js ≥ 22
- `opencode` CLI 1.19.6 di `PATH` (dipakai `createOpencodeServer`)
- Ollama dengan model `huihui_ai/qwen3.5-abliterated:4B` (utama), `qwen3:4b` (fallback), `qwen2.5-coder:3b` (baseline coding)
- Target OWASP Juice Shop di lab sendiri

## Model pilihan (~4GB) & Docker

| Model | Ukuran | Tool calling | Catatan |
|---|---|---|---|
| `huihui_ai/qwen3.5-abliterated:4B` | 3,3 GB | ✅ tools + thinking + vision | Rekomendasi utama: varian uncensored (abliterated) Qwen3.5 4B, konteks 256K |
| `qwen3:4b` | 2,5 GB | ✅ (native Ollama), lebih lambat di CPU | Fallback |
| `qwen2.5-coder:3b` | 1,9 GB | ⚠️ | Baseline coding; tool-calling kurang andal |
| `qwen2.5-coder:7b` | 4,7 GB | ⚠️ sering jadi teks biasa | Jangan dipakai untuk agent loop |

Jalankan infrastruktur dengan Docker yang sudah tersedia:

```bash
docker compose up -d ollama model-init
docker compose wait model-init
docker compose up -d juice-shop
```

Verifikasi bahwa model benar-benar memanggil tool (bukan sekadar menulis JSON tool call sebagai teks):

```bash
npx tsx agent/src/index.ts toolcheck \
  --model ollama/huihui_ai/qwen3.5-abliterated:4B \
  --ollama-base-url http://127.0.0.1:11434/v1
```

Output `ok: true` berarti OpenCode menerima `tool_calls` dari Ollama dan tool `bash` benar-benar dijalankan. `docker-compose.yml` sudah menetapkan `OLLAMA_CONTEXT_LENGTH=32768`.

```bash
npm install
npm run build
npm run typecheck
npm test
```

## Menjalankan satu task (agent saja)

```bash
npx tsx agent/src/index.ts run \
  --task harness/tasks/A05.json \
  --workspace-root ./runs/workspaces \
  --model ollama/huihui_ai/qwen3.5-abliterated:4B \
  --ollama-base-url http://127.0.0.1:11434/v1 \
  --out ./runs/single-run.json
```

Lihat config yang dihasilkan:

```bash
npx tsx agent/src/index.ts config --model ollama/huihui_ai/qwen3.5-abliterated:4B
```

## Menjalankan benchmark penuh

```bash
npx tsx harness/src/index.ts verify --tasks ./harness/tasks

npx tsx harness/src/index.ts run \
  --tasks ./harness/tasks \
  --models huihui_ai/qwen3.5-abliterated:4B,qwen3:4b,qwen2.5-coder:3b \
  --runs 10 \
  --target http://127.0.0.1:3000 \
  --seed 42 \
  --out ./runs \
  --ollama-base-url http://127.0.0.1:11434/v1 \
  --workspace-root ./runs/workspaces
```

Atau lewat root script:

```bash
npm run dev:harness -- run --tasks ./tasks --models huihui_ai/qwen3.5-abliterated:4B --runs 5 --target http://127.0.0.1:3000
```

Catatan: `npm run dev:harness` mengubah cwd ke `harness/`, jadi gunakan path relatif terhadap direktori tersebut (`./tasks`, `./runs`).

## Membangun ulang laporan

```bash
npx tsx harness/src/index.ts aggregate \
  --results ./runs/results.jsonl --out ./runs/summary.json --seed 42

npx tsx harness/src/index.ts report \
  --results ./runs/results.jsonl --out ./runs/report --seed 42
```

Output: `runs/report/index.html` (infografis mandiri, tanpa CDN) dan `runs/report/summary.json`.

## Struktur artefak hasil

```
runs/
├── results.jsonl
├── summary.json
├── metrics.txt
├── report/{index.html,summary.json}
├── workspaces/<run-id>/{main.py,findings.json,requirements.txt,README.md,task.agent.json}
├── transcripts/<run-id>.json
└── <model>/<task>/<rep>/{run.json,evaluation.json,task.agent.json}
```

`run.json` ditulis **harness** dari `RunResult` yang dikembalikan agent, bukan oleh LLM. `task.agent.json` sudah dibersihkan dari ground truth.

## Kubernetes (KubeRaya)

```bash
docker build -t kaderisasi-harness:0.1.0 .
kubectl apply -k manifests/60-benchmark
kubectl apply -f manifests/60-benchmark/runner-job.yaml
```

Manifest mencakup Ollama, Juice Shop, `satpam-guard` (proxy egress + rate limit + metrik), NetworkPolicy default-deny, ResourceQuota/LimitRange, Job, dan ServiceMonitor. Sebelum produksi: pin image Juice Shop **by digest**, ganti PVC `benchmark-results` dengan storage yang tersedia, dan pastikan target di-reset per run.

## Skor

```
total_run  = 0.40·Discovery + 0.20·Evidence + 0.15·Correctness
           + 0.10·CodeQuality + 0.05·Safety                  (maks 90)
total_task = mean(total_run) + 0.10·Reproducibility          (maks 100)
```

Ambang: ≥60 berhasil, ≥80 sangat baik, <40 gagal. Statistik: mean ± SD, bootstrap CI 1000 resample, Wilson interval, Wilcoxon signed-rank dengan koreksi Holm, pass@k, dan CV.

## Integritas

Semua run disimpan termasuk yang gagal; ground truth tidak pernah dikirim ke agent; hasil negatif tetap dilaporkan. Pengujian hanya pada lab milik sendiri.
