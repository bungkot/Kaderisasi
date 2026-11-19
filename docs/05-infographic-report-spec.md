# 05 — Spesifikasi Laporan Infografis

Dokumen ini menentukan **apa** yang ditampilkan, **dari mana** datanya, dan **bagaimana** cara membangunnya ulang. Implementasi: [`harness/src/report.ts`](../harness/src/report.ts).

## 1. Tujuan & audiens

- Menyampaikan hasil benchmark coding agent ke **rekruter/non-teknis** dalam satu halaman.
- Tetap jujur: kegagalan dan limitasi ditampilkan, bukan disembunyikan.
- Bisa dibangun ulang dari artefak mentah (`results.jsonl`).

## 2. Sumber data

| Sumber | Isi |
|---|---|
| `runs/results.jsonl` | satu baris per run: `{run, evaluation}` |
| `runs/summary.json` | agregasi: rows, model summaries, error counts |
| `harness/tasks/*.json` | task card + ground truth |
| `harness/src/aggregate.ts` | rumus agregasi & statistik |

## 3. Seksi laporan (urutan)

1. **Header** — judul, fokus portfolio, ambang sukses, tanggal pembuatan.
2. **Kartu ringkasan** — jumlah model, task, run, pass@1 terbaik, jumlah perbedaan signifikan.
3. **Ringkasan per model** — mean total, SD, CI 95%, pass@1, token/run, durasi/run.
4. **Heatmap task × model** — skor total, warna merah→hijau.
5. **Radar dimensi** — discovery, evidence, correctness, code quality, safety, reproducibility.
6. **Bar mean total + CI 95%**.
7. **Analisis kesalahan** — frekuensi kelas kesalahan.
8. **Perbandingan model** — Wilcoxon signed-rank per task, penanda signifikan.
9. **Detail task per model** — n, sukses, total, sub-skor, CV.
10. **Limitasi & integritas**.
11. **Cara reproducible** — perintah + artefak.

## 4. Spesifikasi visual

| Elemen | Spesifikasi |
|---|---|
| Tema | gelap (`#0f1220`), kartu `#181d33`, garis `#2a3154` |
| Aksen | biru `#6ea8fe`; radar multi-warna |
| Heatmap | `hsl(hue 70% 55%)`, hue = 0 (merah) → 120 (hijau) sesuai skor 0–100 |
| Tipografi | system-ui; judul 26px, seksi 18px, isi 14px |
| Lebar | maks 1100px, responsif (grid menurun di <800px) |
| Aksesibilitas | kontras teks ≥ 4.5:1; `aria-label` pada SVG; angka juga sebagai teks |
| Bahasa | Indonesia |

## 5. Grafik & rumus

### 5.1 Skor total

```
total_task = mean(total_run) + 0.10 × reproducibility        (maks 100)
total_run  = 0.40·Discovery + 0.20·Evidence + 0.15·Correctness
           + 0.10·CodeQuality + 0.05·Safety                  (maks 90)
reproducibility = 100 × success_rate × (1 − min(CV, 0.5))
success_rate    = proporsi run dengan ≥1 temuan ground-truth inti
```

### 5.2 Discovery

```
precision = |A ∩ G| / |A|
recall    = |A ∩ G_core| / |G_core|
F1        = 2·P·R/(P+R)
Discovery = 100·F1
```

### 5.3 Statistik

- Mean ± SD per (model, task).
- CI 95%: bootstrap 1000-resample (percentile) untuk skor; Wilson untuk success rate.
- Perbandingan model: Wilcoxon signed-rank dua sisi per task; signifikan bila `p < 0.05`.
- Pass@1: proporsi task dengan skor ≥ 60.
- CV = SD/mean; CV tinggi = agent tidak andal.

### 5.4 Analisis kesalahan

Kelas: `ok`, `timeout`, `error`, `invalid_findings`, `missing_artifact`, `no_true_positive`, `false_positives`, `category_mismatch`.

## 6. Output

```
runs/report/
├── index.html       # infografis mandiri (tanpa CDN)
└── summary.json     # data mentah agregasi
```

## 7. Reproducible

```bash
cd harness
npm run dev -- --tasks ./tasks --models <m1,m2,m3> --runs 5 --target <url>
npm run dev -- --report-only --results ./runs/results.jsonl --out ./runs/report
```

## 8. Integritas

- Semua run disimpan; tidak ada cherry-picking.
- Hasil negatif/degenerate tetap muncul.
- Ground truth tidak bocor ke agent.
- Laporan menampilkan limitasi & bias (lihat docs/03 §7).
