# Agentic Pentest Benchmark

Proyek riset ini mengukur coding agent lokal berbasis **TypeScript**,
**OpenCode SDK**, dan **Ollama** yang menyusun proyek skrip **Python** untuk
task OWASP Top 10:2025 di workspace per run. Harness membandingkan output
dengan ground truth task dan membangun ringkasan eksperimen. Target yang
disediakan adalah OWASP Juice Shop untuk pengujian lab terotorisasi.

> Gunakan hanya pada target yang dimiliki atau yang pengujiannya telah
> diizinkan secara eksplisit. Prompt, allowlist tool, dan pemeriksaan evaluator
> bukan sandbox jaringan/OS. Tinjau skrip sebelum menjalankannya di luar
> workspace eksperimen.

## Peta dokumentasi

- [Dokumentasi dan arsitektur](./docs/README.md)
- [Agent runtime dan batas keamanan](./docs/agent-runtime.md)
- [Metodologi evaluasi dan limitasi](./docs/evaluation.md)
- [Operasi lokal dan Docker Compose](./docs/operations.md)
- [Artefak dan laporan](./docs/reporting.md)
- [Konvensi untuk coding agent](./AGENTS.md)

## Struktur repository

```text
shared/src/   tipe, skema, konstanta, utilitas bersama
agent/src/    OpenCode SDK, prompt, lifecycle agent, validasi workspace
harness/src/  orkestrasi, evaluasi, agregasi, metrik, laporan
harness/tasks/ task OWASP A01–A10 dan ground truth evaluator
docs/         arsitektur, operasi, evaluasi, dan kontrak sistem
```

## Prasyarat

- Node.js 22+, npm, dan Python 3.
- `opencode` CLI pada `PATH`.
- Ollama dan model yang dipilih.
- Docker Compose opsional untuk menjalankan Ollama dan Juice Shop lokal.

Instal dependency dan cek repository:

```bash
npm install
npm run typecheck
npm test
npm run build
```

Model bawaan didefinisikan di `shared/src/constants.ts`. Verifikasi tool
calling model sebelum run:

```bash
npx tsx agent/src/index.ts toolcheck \
  --model ollama/qwen3:4b \
  --ollama-base-url http://127.0.0.1:11434/v1
```

## Menyiapkan target lab

Dengan Docker Compose:

```bash
docker compose up -d ollama juice-shop
docker compose up model-init
docker compose ps
```

Juice Shop dipublikasikan di `http://127.0.0.1:3000`. Periksa
[panduan operasi](./docs/operations.md) untuk catatan batasan Compose sebelum
menjalankan benchmark. Harness pada host membutuhkan `opencode` CLI di `PATH`;
image runner Compose saat ini belum memasangnya.

## Menjalankan satu task

```bash
npx tsx agent/src/index.ts run \
  --task harness/tasks/A05.json \
  --target http://127.0.0.1:3000 \
  --workspace-root ./workspaces \
  --model ollama/qwen3:4b \
  --ollama-base-url http://127.0.0.1:11434/v1 \
  --out ./runs/single-run.json
```

Task A05 hanya contoh task; pilih target lab yang sesuai dan telah diotorisasi.
Workspace hasil dan `RunResult` ditulis ke lokasi yang ditentukan.

## Menjalankan benchmark

```bash
npx tsx harness/src/index.ts verify --tasks ./harness/tasks

npx tsx harness/src/index.ts run \
  --tasks ./harness/tasks \
  --models ollama/qwen3:4b,ollama/qwen2.5-coder:3b \
  --runs 5 \
  --target http://127.0.0.1:3000 \
  --seed 42 \
  --out ./runs \
  --ollama-base-url http://127.0.0.1:11434/v1 \
  --workspace-root ./workspaces
```

Harness memakai nama `ollama/<model-id>` agar prefix provider dapat dipisahkan
dengan benar. Tambahkan model namespace sesuai format
`ollama/<namespace>/<model>:<tag>` bila diperlukan.

Laporan dapat dibuat ulang dari hasil:

```bash
npx tsx harness/src/index.ts report \
  --results ./runs/results.jsonl \
  --out ./runs/report \
  --seed 42 \
  --target http://127.0.0.1:3000
```

## Status dan batas klaim

Kode agent, harness, task suite, agregasi, dan renderer laporan sudah ada.
Namun evaluasi safety hanya heuristik dan tidak memonitor semua trafik maupun
mengisolasi proses secara komprehensif. Jangan mengartikan skor sebagai
sertifikasi keamanan atau performa umum. Metode dan limitasi dijelaskan di
[dokumen evaluasi](./docs/evaluation.md).
