# AGENTS.md — konvensi pengembangan repo ini

## Struktur

- Semua kode TypeScript harus berada di `src/` dari workspace masing-masing: `shared/src`, `agent/src`, `harness/src`.
- `shared/` berisi tipe, skema, konstanta, dan utilitas yang dipakai lebih dari satu workspace. Jangan duplikasi tipe.
- `agent/` hanya menangani interaksi dengan OpenCode SDK dan siklus hidup satu run. Tinjauan, agregasi, dan pelaporan ada di `harness/`.
- `harness/` yang menulis `run.json`, `evaluation.json`, `results.jsonl`, `summary.json`, dan laporan. Agent tidak boleh dipercaya untuk menulis metadata dirinya sendiri.

## Gaya

- Ikuti gaya yang ada: TypeScript ESM, `NodeNext`, `strict`, `verbatimModuleSyntax`.
- Gunakan `import type` untuk impor bertipe saja.
- Jangan menambahkan komentar pada kode kecuali diminta.
- Bahasa dokumen dan laporan: Indonesia; identifier kode: Inggris.

## Verifikasi wajib sebelum selesai

```bash
npm run typecheck
npm test
```

Keduanya harus lulus. `npm run build` juga harus lulus sebelum membuat image Docker.

## Aturan API OpenCode SDK

- `@opencode-ai/sdk` 1.19.6 memakai `responseStyle: "fields"` secara default; akses hasil lewat `.data` dengan helper `unwrap` di `agent/src/agent.ts`.
- Jangan mengandalkan `responseStyle: "data"` di `createOpencodeClient` karena tipe generik method tetap `"fields"`.
- SSE (`client.event.subscribe`) adalah sumber progres utama; polling `session.status` hanya fallback.
- Gunakan agent kustom `pentest-builder`; jangan pakai agent `build` untuk run benchmark.

## Keamanan

- Jangan menaruh secret, token, atau kredensial di repo maupun log.
- Ground truth (`harness/tasks/*.json`) tidak boleh masuk prompt; selalu lewat `stripGroundTruth`.
- Pelanggaran scope bersifat hard gate; jangan melunakkan skor safety.
