# Operasi dan reproduksibilitas

## Prasyarat

- Node.js 22 atau lebih baru dan npm.
- `opencode` CLI yang dapat dipanggil dari `PATH` untuk menjalankan agent.
- Ollama dengan model yang dipilih sudah tersedia.
- Python 3 untuk validasi sintaks `main.py`.
- Docker Compose hanya diperlukan untuk stack lokal yang disediakan proyek.

Model default pada `shared/src/constants.ts` adalah
`huihui_ai/qwen3.5-abliterated:4B`, `qwen3:4b`, dan
`qwen2.5-coder:3b`. Pastikan model mampu melakukan tool calling dengan
perintah `toolcheck`; deklarasi `tool_call` di config tidak menjamin
kemampuan model.

## Instalasi dan pemeriksaan

```bash
npm install
npm run typecheck
npm test
npm run build
```

Untuk perubahan kode, typecheck dan test adalah pemeriksaan wajib. Build juga
dijalankan sebelum membangun image Docker.

## Verifikasi tool calling

```bash
npx tsx agent/src/index.ts toolcheck \
  --model ollama/huihui_ai/qwen3.5-abliterated:4B \
  --ollama-base-url http://127.0.0.1:11434/v1
```

Command mengembalikan `ok: true` jika tool call terdeteksi. Ini bukan tes
keamanan atau akurasi model.

## Menjalankan satu task

Jalankan target lab yang dikelola sendiri, misalnya Juice Shop lokal:

```bash
npx tsx agent/src/index.ts run \
  --task harness/tasks/A05.json \
  --target http://127.0.0.1:3000 \
  --workspace-root ./workspaces \
  --model ollama/qwen3:4b \
  --ollama-base-url http://127.0.0.1:11434/v1 \
  --out ./runs/single-run.json
```

`--target` mengoverride target task dan membatasi field scope pada origin URL
tersebut. Agent menghasilkan workspace di bawah `workspaces/`; file `--out`
menyimpan hasil run, bukan evaluation harness.

Untuk meninjau konfigurasi yang dibangun per run:

```bash
npx tsx agent/src/index.ts config --model ollama/qwen3:4b
```

## Menjalankan benchmark

Pastikan Ollama dan target lab dapat diakses dari proses harness. Nilai model
harus menggunakan bentuk `ollama/<model-id>`; prefix provider diperlukan agar
parser tidak salah menafsirkan ID model yang memiliki namespace.

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

Nama model Hugging Face dengan namespace, jika digunakan, perlu ditulis
`ollama/<namespace>/<model>:<tag>`. Sesuaikan daftar model dengan model yang
benar-benar tersedia di Ollama.

Alternatif root script:

```bash
npm run dev:harness -- run --tasks ./tasks \
  --models ollama/qwen3:4b --runs 1 \
  --target http://127.0.0.1:3000
```

Script workspace dijalankan dari direktori `harness/`; path relatif pada
perintah tersebut relatif terhadap direktori itu.

## Docker Compose

`docker-compose.yml` mendefinisikan Ollama, proses `model-init`, Juice Shop
v17.1.0, serta service `harness` di profile `bench`. Untuk memulai service
dasar:

```bash
docker compose up -d ollama juice-shop
docker compose up model-init
docker compose ps
```

Service `harness` tersedia pada profile `bench`, tetapi image yang saat ini
dibangun oleh `Dockerfile` tidak memasang `opencode` CLI yang diperlukan oleh
`createOpencodeServer`. Karena itu profile tersebut belum dapat dianggap
end-to-end runnable tanpa menyediakan CLI di image. Untuk benchmark lokal,
jalankan harness dari host yang memiliki `opencode` di `PATH`:

```bash
npx tsx harness/src/index.ts run \
  --tasks ./harness/tasks \
  --models ollama/qwen3:4b \
  --runs 1 \
  --target http://127.0.0.1:3000 \
  --ollama-base-url http://127.0.0.1:11434/v1
```

Stack ini konfigurasi development satu host, bukan isolasi jaringan yang
terjamin. Port Ollama `11434` dan Juice Shop `3000` dipublikasikan ke host;
image Ollama menggunakan tag `latest`; target tidak otomatis di-reset ke state
awal untuk setiap run. Jangan mengekspos stack ke jaringan yang tidak tepercaya.
Jika service `harness` dijalankan di container setelah CLI ditambahkan,
verifikasi pula bahwa service dapat saling menjangkau melalui jaringan Compose
dan volume output sesuai dengan konfigurasi run.

## Seed, waktu, dan artefak

Catat `--seed`, daftar model, target, jumlah run, serta perubahan konfigurasi
untuk setiap eksperimen. Seed mengatur urutan task dan bootstrap, tetapi tidak
membuat inferensi model deterministik. Semua kegagalan harus dipertahankan dan
dilaporkan bersama run sukses.

Struktur hasil benchmark dirangkum di [Pelaporan](./reporting.md).
