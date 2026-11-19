# Dokumentasi

Dokumentasi ini menjelaskan implementasi yang ada di repository, bukan blueprint
untuk komponen yang belum dibuat. Mulai dari [arsitektur](./architecture.md),
lalu gunakan panduan sesuai pekerjaan:

| Dokumen | Tujuan |
|---|---|
| [Arsitektur](./architecture.md) | Batas tanggung jawab workspace dan alur benchmark |
| [Agent runtime](./agent-runtime.md) | Siklus agent, kontrak artefak, dan batas keamanan |
| [Evaluasi](./evaluation.md) | Task OWASP, ground truth, skor, dan statistik |
| [Operasi](./operations.md) | Prasyarat, perintah lokal, dan Docker Compose |
| [Pelaporan](./reporting.md) | Artefak hasil dan laporan HTML |

## Ruang lingkup

Proyek ini mengevaluasi coding agent lokal berbasis TypeScript, OpenCode SDK,
dan Ollama yang menyusun proyek skrip Python untuk task OWASP Top 10:2025 di
workspace terpisah. Task saat ini menggunakan OWASP Juice Shop sebagai target
lab. Ini bukan layanan pemindaian umum atau otorisasi untuk menguji sistem pihak
lain. Jalankan hanya pada target yang dimiliki atau yang pengujiannya telah
diizinkan secara eksplisit.

## Status yang dapat diverifikasi

- Implementasi agent, harness, sepuluh task, agregasi, dan renderer laporan ada
  di repository.
- Docker Compose menyediakan Ollama, Juice Shop, dan runner benchmark opsional.
- Runner Compose belum end-to-end runnable: image harness belum menyediakan
  binary `opencode` yang diperlukan agent.
- Evaluasi dan kontrol keselamatan saat ini berbasis validasi artefak serta
  heuristik; batas jaringan dan eksekusi yang terisolasi belum ditegakkan oleh
  repository.
- Angka skor atau klaim performa hanya dapat dibuat setelah eksperimen
  dijalankan dan artefak hasilnya ditinjau.

Lihat [README utama](../README.md) untuk quick start dan
[instruksi pengembangan agent](../AGENTS.md) untuk konvensi repository.
