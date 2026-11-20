# Instruksi coding agent repository

## Tujuan dan batas

Repository ini berisi coding agent berbasis TypeScript, OpenCode SDK, dan
Ollama untuk menyusun proyek skrip Python bagi task OWASP Top 10:2025 di
workspace eksperimen, beserta harness evaluasinya.

Semua perubahan atau contoh pengujian harus mempertahankan batas penggunaan
yang terotorisasi: target lab milik sendiri atau target yang secara eksplisit
diizinkan, cakupan sempit, dan aktivitas non-destruktif. Jangan menambahkan
fitur untuk DoS, kredensial harvesting, persistensi, penghindaran deteksi,
eksfiltrasi, atau eksekusi di luar workspace. Jangan menyatakan prompt atau
konfigurasi tool sebagai sandbox jaringan/OS.

Ground truth di `harness/tasks/*.json` hanya untuk evaluator. Jangan masukkan
ground truth ke prompt atau file input agent; gunakan `stripGroundTruth`.
Perubahan pada perilaku safety harus mempertahankan hard gate yang ada dan
mendokumentasikan batas yang belum ditegakkan.

## Struktur dan tanggung jawab

- Semua kode TypeScript berada di `src/` workspace terkait.
- `shared/`: tipe, skema, konstanta, utilitas lintas-workspace.
- `agent/`: OpenCode SDK, konfigurasi agent, prompt, siklus hidup satu run,
  validasi workspace, event, dan metering.
- `harness/`: pemuatan task, orkestrasi, evaluasi, agregasi, metrik, dan laporan.
- Harness adalah sumber metadata benchmark seperti `run.json`,
  `evaluation.json`, `results.jsonl`, dan `summary.json`.

Dokumentasi resmi repository dimulai dari `docs/README.md`. Perbarui dokumen
terkait bila kontrak, CLI, skema, atau output berubah; hapus klaim desain lama
yang tidak sesuai implementasi.

## Gaya

- TypeScript ESM, NodeNext, strict, dan `verbatimModuleSyntax`.
- Gunakan `import type` untuk impor yang hanya digunakan sebagai tipe.
- Identifier kode berbahasa Inggris; dokumentasi dan laporan berbahasa Indonesia.
- Ikuti format dan pola yang sudah ada; jangan menambah komentar kecuali
  diperlukan untuk menjelaskan logika yang tidak jelas.
- Jangan menyimpan secret, token, kredensial, atau data sensitif di repository,
  transcript, maupun log.

## OpenCode SDK

- Repository memakai klien V2 `@opencode/client` dengan server OpenCode 2;
  `client.event.subscribe` adalah async iterable SSE. Klien embedded
  `@opencode/sdk` tidak dipakai karena butuh Node 24+ (`await using`).
- Respons klien V2 langsung berisi nilai, tanpa pembungkus `.data`.
- Benchmark memakai agent `pentest-builder`, bukan agent `build`.
- Konfigurasi per run dibangun di `agent/src/permission.ts` dalam bentuk V2
  (`providers`, `agents`, `policies`, `permissions`) dan menyertakan
  `body.reasoning_effort: "none"`; bila static `agent/opencode.agent.json`
  berubah, pastikan tidak mengklaim bahwa file itu menggantikan konfigurasi
  runtime.

## Verifikasi sebelum selesai

Jalankan keduanya untuk perubahan kode:

```bash
npm run typecheck
npm test
```

Jalankan `npm run build` sebelum membangun image Docker. Untuk perubahan
dokumentasi saja, pastikan tautan dan perintah konsisten dengan CLI serta
implementasi saat ini.
