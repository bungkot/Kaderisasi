# Arsitektur sistem

## Sasaran

Sistem menjalankan satu coding agent per run. Agent menerima task card tanpa
ground truth, membuat proyek Python di workspace run, lalu mengembalikan
metadata eksekusi. Harness memvalidasi artefak, membandingkan temuan dengan
ground truth privat, dan menyimpan hasil untuk analisis.

## Batas workspace

| Workspace | Tanggung jawab |
|---|---|
| `shared/` | Tipe, skema Zod, konstanta, dan utilitas yang dipakai bersama |
| `agent/` | OpenCode SDK, konfigurasi agent, prompt, event stream, lifecycle run, validasi workspace, dan usage |
| `harness/` | Task loader, orkestrasi, evaluasi, agregasi statistik, metrik, dan laporan |

Kode TypeScript berada di `src/` workspace masing-masing. `harness/tasks/`
menyimpan task card beserta ground truth; `shared/src/util.ts` menyediakan
`stripGroundTruth` yang dipakai runner sebelum menyerahkan task ke agent.

## Alur satu run

```text
harness/tasks/*.json
       │ load + validasi skema
       ▼
harness runner ── stripGroundTruth + target/scope
       │
       ▼
agent ── prompt ── OpenCode server/SDK ── Ollama
       │                    │
       │                    ├─ tools bekerja pada workspace run
       │                    └─ SSE + fallback polling status
       ▼
main.py, findings.json, requirements.txt, README.md
       │
       ├─ cek berkas, skema findings, kompilasi main.py
       ├─ repair prompt sampai batas konfigurasi
       └─ transcript, usage, session diff
       ▼
harness ── run.json + evaluation.json + results.jsonl
       │
       └─ summary.json + metrics.txt + report/index.html
```

`agent/src/loop.ts` mengatur satu run dan repair. `agent/src/agent.ts`
membungkus SDK dan event stream. `harness/src/runner.ts` adalah batas antara
task rahasia dan input agent; `harness/src/evaluate.ts` serta
`harness/src/aggregate.ts` menangani penilaian dan agregasi.

## Kontrak data

- Task input tervalidasi menggunakan `TaskDefinitionSchema`.
- Agent menerima `AgentTaskCard`, tidak menerima `ground_truth`.
- Temuan keluaran mengikuti `FindingsSchema`.
- `RunResult` berisi status, usage, durasi, diff, error, dan path artefak.
- Harness menyimpan hasil per run dan satu baris `{ run, evaluation }` ke
  `results.jsonl`.

Skema dan tipe bersama berada di `shared/src/schema.ts` dan
`shared/src/types.ts`. Struktur file keluaran dan cara membuat laporan dijelaskan
di [Pelaporan](./reporting.md).

## Keputusan arsitektur yang perlu dipertahankan

1. Agent hanya menangani satu run; evaluasi dan agregasi tetap tanggung jawab
   harness.
2. Ground truth tidak boleh masuk ke prompt, transcript input, atau artefak
   workspace agent.
3. Identitas hasil eksperimen berasal dari `RunResult` dan evaluasi harness,
   bukan dari klaim teks model.
4. Konfigurasi OpenCode benchmark dibangun per run oleh
   `agent/src/permission.ts`; `agent/opencode.agent.json` adalah konfigurasi
   pendamping, bukan sumber konfigurasi dinamis.
5. Semua target harus berada dalam scope lab yang diotorisasi. Prompt dan
   permission OpenCode bukan pengganti isolasi jaringan atau sandbox.
