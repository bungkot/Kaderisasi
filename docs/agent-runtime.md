# Agent runtime dan kontrak workspace

## Runtime

Agent dijalankan dari `agent/src/index.ts` dan menggunakan klien V2
`@opencode/client` untuk berbicara dengan server OpenCode 2. Setiap run
men-spawn `opencode serve` dengan `HOME`, `OPENCODE_CONFIG_CONTENT`, dan
`OPENCODE_PASSWORD` yang terisolasi. Klien embedded `@opencode/sdk` tidak
dipakai karena membutuhkan Node 24+ (`await using`), sementara repository ini
berjalan di Node 22. Config per run dibangun oleh `buildAgentConfig` di
`agent/src/permission.ts`. Nama agent benchmark default adalah `pentest-builder`;
model dipasok melalui provider OpenCode Ollama.

Config memakai bentuk native V2: `providers`, `agents`, `policies`, dan
`permissions`. Provider Ollama memuat
`body.reasoning_effort: "none"` agar reasoning Qwen3 dimatikan lewat API
OpenAI-compatible; definisi tool tetap dikirim. Field `body` hanya bekerja pada
bentuk `providers` (V2), bukan `provider` (V1).

Alur runtime:

1. Buat direktori unik di bawah `workspaceRoot` dan simpan task card yang sudah
   dibersihkan.
2. Buat session OpenCode dengan direktori tersebut sebagai location.
3. Kirim prompt, lalu tunggu `experimental.session.wait` dan event `session.idle`
   atau `session.execution.failed`.
4. Saat session idle, validasi artefak dan `findings.json`; `main.py` diperiksa
   dengan `python3 -m py_compile`.
5. Jika validasi gagal, kirim error validasi sebagai repair prompt sampai
   `maxRepairRounds` tercapai.
6. Simpan transcript, usage, dan session diff; perubahan di luar workspace
   membuat status run menjadi error.

Default yang didefinisikan di `shared/src/constants.ts`: timeout 15 menit,
maksimal 60 langkah, dan 3 putaran repair. Timeout dapat dioverride melalui
CLI. Tool call dihitung setelah session selesai; nilai `maxToolCalls` yang ada
di opsi belum diterapkan sebagai batas runtime. Nilai konfigurasi yang
diterapkan pun bukan jaminan bahwa setiap operasi model aman.

## Artefak yang wajib ada

Setiap workspace run harus berisi:

| File | Kontrak |
|---|---|
| `main.py` | CLI Python yang menerima `--target` dan `--output` |
| `findings.json` | Array temuan yang sesuai `FindingsSchema` |
| `requirements.txt` | Daftar dependency proyek |
| `README.md` | Petunjuk penggunaan dan penjelasan singkat |

File tambahan diperbolehkan. Validator saat ini mengecek keberadaan empat file,
parse JSON dan skema findings, serta kompilasi sintaks `main.py`. Validator
tidak menjalankan linter, tidak mengaudit dependency, dan tidak membuktikan
bahwa temuan benar atau skrip aman.

Satu temuan memiliki `id`, `title`, `owasp_id`, `severity`, `endpoint`,
`method`, `evidence`, `confidence`, dan field opsional `payload` serta
`remediation`. Bentuk kanonis berada di `shared/src/schema.ts`.

## Batas keamanan dan otorisasi

- Gunakan hanya target lab yang dimiliki atau memiliki izin tertulis. Target
  dan scope benchmark dibentuk dari URL target yang diberikan kepada runner.
- Skrip yang dihasilkan dapat berisi request jaringan dan dapat dijalankan
  melalui tool agent. Tinjau kode sebelum eksekusi di luar run lab terkendali.
- Policy OpenCode membatasi tool dan pola perintah, tetapi bukan sandbox OS.
  Beberapa perintah yang diizinkan, termasuk `curl`, dapat mengakses jaringan.
- Pada V2, aksi `doom_loop` tidak lagi tersedia, sehingga pembatasan lama
  `doom_loop: "deny"` tidak dapat diterapkan; `webfetch`, `websearch`, `subagent`,
  `skill`, `question`, dan `external_directory` tetap ditolak lewat `permissions`.
- Mati reasoning mengubah perilaku dan biaya model, tetapi tidak menjamin
  keluaran bebas reasoning pada model atau runtime lain.
- Pemeriksaan diff mendeteksi path file di luar workspace yang dilaporkan oleh
  session; ini bukan pencegahan akses filesystem yang komprehensif.
- Evaluator saat ini tidak memonitor seluruh HTTP request yang dibuat skrip,
  sehingga tidak membuktikan bahwa setiap request tetap pada scope.
- Jangan menaruh kredensial, data pribadi, atau secret di task, prompt,
  workspace, transcript, maupun log. Jangan menguji dengan DoS atau perubahan
  data destruktif.

Dengan demikian, implementasi saat ini cocok untuk eksperimen terkontrol pada
lab lokal, bukan untuk mengklaim isolasi keamanan produksi.

## Troubleshooting singkat

- Jalankan `agent ... toolcheck` untuk memeriksa tool calling model sebelum
  eksperimen.
- Pastikan CLI `opencode`, Ollama, model yang dipilih, dan `python3` tersedia.
- Periksa log terstruktur, `transcripts/<run-id>.json`, `run.json`, dan
  `errors` jika status run bukan `completed`.
- Perbaikan artefak hanya dilakukan sampai batas repair yang dikonfigurasi;
  run gagal tetap disimpan oleh harness.
