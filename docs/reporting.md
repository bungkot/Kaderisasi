# Artefak dan pelaporan

## Keluaran benchmark

Untuk setiap model, task, dan replikasi, harness menyimpan:

```text
runs/
├── results.jsonl
├── summary.json
├── metrics.txt
├── report/
│   ├── index.html
│   └── summary.json
└── <model-sanitized>/<task-id>/<rep>/
    ├── run.json
    ├── task.agent.json
    └── evaluation.json

workspaces/<run-id>/
├── task.agent.json
├── main.py
├── findings.json
├── requirements.txt
└── README.md

transcripts/<run-id>.json
```

Model path disanitasi untuk nama direktori. `results.jsonl` berisi satu objek
`{ "run": ..., "evaluation": ... }` per baris. Harness menulis `run.json`,
`evaluation.json`, salinan task agent, agregat, dan metrik. Agent menyimpan
transcript dan artefak workspace. Dalam mode CLI agent tunggal, opsi `--out`
menyimpan `RunResult` tanpa evaluasi.

`task.agent.json` tidak boleh mengandung ground truth. Perlakukan transcript dan
artefak sebagai data eksperimen yang dapat memuat URL atau input target; tinjau
sebelum membagikannya.

## Membuat ulang agregat dan HTML

```bash
npx tsx harness/src/index.ts aggregate \
  --results ./runs/results.jsonl \
  --out ./runs/summary.json \
  --seed 42 \
  --target http://127.0.0.1:3000

npx tsx harness/src/index.ts report \
  --results ./runs/results.jsonl \
  --out ./runs/report \
  --seed 42 \
  --target http://127.0.0.1:3000
```

Laporan HTML dibuat mandiri tanpa CDN. Implementasi saat ini menampilkan kartu
ringkasan, tabel per model, heatmap task × model, bar skor dengan CI, hitungan
kelas error, perbandingan model, limitasi, dan perintah reproduksi. Ia tidak
membuat radar chart atau melakukan review manusia.

## Interpretasi

- CI dan p-value berasal dari implementasi statistik di `harness/src/aggregate.ts`;
  catatan metode disertakan pada `summary.json`.
- Evidence dan safety adalah heuristik, bukan sertifikasi keamanan.
- Skor harus dibaca bersama jumlah run, status error, task, serta batas validitas
  di [Evaluasi](./evaluation.md).
- Jangan menyajikan laporan sebagai hasil OWASP resmi atau hasil pemindaian
  sistem produksi.
