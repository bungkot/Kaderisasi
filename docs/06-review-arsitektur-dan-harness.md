# 06 — Review Arsitektur & Blueprint Harness

> Dokumen analitis untuk persiapan implementasi. Semua klaim API diverifikasi terhadap
> `@opencode-ai/sdk@1.19.6` (selaras dengan `opencode` CLI 1.19.6) dengan membaca
> `dist/*.d.ts` dan `dist/*.js` paket SDK, bukan dari dokumentasi informal.
>
> Lingkup: coding agentic loop berbasis TypeScript + OpenCode SDK + Ollama, dan
> harness benchmark yang menggerakkannya.

## 0. Ringkasan eksekutif

Repo ini **hanya berisi docs** (5 file, tanpa git, tanpa kode). Kondisi nyata:

| Yang diklaim docs | Kenyataan |
|---|---|
| `agent/src/agent.ts`, `agent/src/prompts.ts`, `agent/opencode.json.example` | tidak ada |
| `harness/src/evaluate.ts`, `harness/src/aggregate.ts`, `harness/src/report.ts`, `harness/README.md` | tidak ada |
| `harness/tasks/*.json` (10 task) | tidak ada |
| `manifests/60-benchmark/` | tidak ada |
| `README.md` (perintah reproduksi) | tidak ada |
| `archive/analyzer-v1/` | tidak ada |

Akibatnya, **evidence map di docs/01 §4 belum menjadi bukti**. Docs/01 §6 sudah jujur
menandai tahap 2–5 sebagai 🚧/⏳, tetapi evidence map dan docs/02–05 ditulis seolah
artefak sudah ada. Untuk portfolio rekruter, ini risiko kredibilitas: tambahkan kolom
status pada evidence map, atau bangun artefaknya.

Temuan teknis yang harus diperbaiki sebelum menulis kode:

1. **Contoh kode SDK di docs/02 perlu sedikit koreksi**: akses `.data` sebenarnya benar
   (default `responseStyle: "fields"`), tetapi key `"toolcall"` salah (harus `tool_call`),
   dan `as never` sebaiknya `as Config`. Polling boleh, tapi SSE lebih baik.
2. **"Agentic loop" belum ada**: docs/02 §2.1 menggambarkan satu `promptAsync` lalu
   polling sampai `idle`. Itu *one-shot generation*, bukan loop. Belum ada verifikasi
   artefak, perbaikan (repair), watchdog langkah, atau penanganan permission headless.
3. **Keamanan bertumpu pada prompt**. Prompt constraint mudah ditembus model lemah;
   butuh enforcement di jaringan dan sandbox eksekusi (§9).
4. **Metodologi punya inkonsistensi formula** (docs/03 §5 vs docs/05 §5.1) dan ancaman
   validitas: n≥5 terlalu kecil untuk Wilcoxon, multiple comparison 30 uji, target
   "di-restart" belum tentu reset state, dan kontensi resource di 1 node (§7.4).

Rekomendasi arsitektur (detail §4–§10): monorepo `agent/` + `harness/` + `manifests/`,
loop berbasis event SSE dengan fallback polling, kontrak artefak imutabel yang ditulis
harness (bukan agent), evaluator deterministik, statistik bootstrap + koreksi
multi-test, dan enforcement keamanan di luar prompt.

## 1. Audit kondisi & kesiapan

### 1.1 Yang sudah ada

- `docs/01` portfolio overview — masalah, metode, evidence map, matriks skill.
- `docs/02` coding agent design — kontrak workspace, prompt, konfigurasi Ollama, SRE.
- `docs/03` benchmark methodology — task suite, metrik, statistik, validitas.
- `docs/04` infra & SRE KubeRaya — topologi, NetworkPolicy, observability.
- `docs/05` infographic spec — sumber data, seksi laporan, visual.

Kualitas docs secara umum **bagus**: ada kontrol, randomisasi, repeat, rubrik berbobot,
analisis bias, dan integritas (lapor semua run). Yang kurang adalah konsistensi silang
dan ketegasan beberapa definisi (§7).

### 1.2 Yang belum ada (gap implementasi)

| Area | Gap | Dampak |
|---|---|---|
| Agent | belum ada adapter SDK, loop, prompt, permission policy | tidak ada yang bisa dijalankan |
| Harness | belum ada orchestrator, evaluator, agregasi, report | tidak ada pengukuran |
| Task suite | 10 task card + ground truth belum ada | evaluator tak punya pembanding |
| Infra | manifest K8s belum ada | tidak bisa direproduksi |
| Repo | tanpa `README.md`, `package.json`, `tsconfig`, git | tidak reproducible |
| Keamanan | tanpa guard jaringan/sandbox eksekusi | klaim safety tak terverifikasi |
| Data | tanpa `results.jsonl`, `summary.json` | laporan tak bisa dibangun |

## 2. Verifikasi docs/02 terhadap SDK `@opencode-ai/sdk@1.19.6`

### 2.1 Tabel koreksi

| docs/02 | SDK 1.19.6 (nyata) | Status |
|---|---|---|
| `createOpencodeServer({ port: 4096, config })` | `ServerOptions { hostname?, port?, signal?, timeout?, config? }` | ✅ |
| `config: {...} as never` | `config?: Config` (tiped) | ⚠️ ganti `as Config` |
| `client.session.create({ query:{directory}, body:{title} })` | `SessionCreateData` persis seperti itu | ✅ |
| `(sess as any).data?.id` | default `responseStyle: "fields"` → `sess.data.id` benar; hindari `any`, pakai helper `unwrap` | ⚠️ |
| `session.promptAsync({ path:{id}, body:{ model, agent, parts } })` | `SessionPromptAsyncData` persis | ✅ |
| `client.session.status({query:{directory}})` | `GET /session/status` → `{ [sessionID]: SessionStatus }` | ✅ |
| `st = r?.data?.[sessionID]` | benar untuk `responseStyle` default | ✅ |
| `client.session.messages({path:{id}})` | `GET /session/{id}/message` → `Array<{ info, parts }>` | ✅ |
| `for (const {info} of msgs.data ?? [])` | benar untuk `responseStyle` default | ✅ |
| `info.tokens.input + info.tokens.output` | `AssistantMessage.tokens.{input,output,reasoning,cache}` | ✅ |
| biaya | `AssistantMessage.cost` | ✅ (tapi lihat §8.3) |
| `agent: "build"` | `SessionPromptData.body.agent` | ✅ |
| model `"toolcall": true` | `ProviderConfig.models[].tool_call?: boolean` | ❌ key salah |
| polling `sleep(2000)` | valid, tapi SSE `event.subscribe()` lebih baik | ⚠️ |
| abort/timeout | `session.abort({ path:{id} })` | ✅ (tapi belum dipakai) |
| workspace leak | `session.diff({ path:{id} })` → `FileDiff[]` | ✅ (tapi belum dipakai) |

### 2.2 Adapter yang benar (inti)

```ts
import { createOpencodeServer, createOpencodeClient, type Config } from "@opencode-ai/sdk"

const server = await createOpencodeServer({
  port: 0, // port acak; URL diparsing dari stdout server
  timeout: 15_000,
  config: opencodeConfig as Config,
})
const client = createOpencodeClient({ baseUrl: server.url })

// Helper: responseStyle default adalah "fields", jadi hasil selalu { data, error, request, response }.
// Menaruh responseStyle: "data" di createOpencodeClient TIDAK mengubah tipe generik method.
function unwrap<T>(result: { data: T | undefined; error?: unknown }): T {
  if (result.error) throw new Error(JSON.stringify(result.error))
  if (result.data === undefined) throw new Error("empty response")
  return result.data
}

// 1) session
const sessionResult = await client.session.create({
  query: { directory: workspace },
  body: { title: runId },
})
const sessionID = unwrap(sessionResult).id

// 2) prompt asinkron
await client.session.promptAsync({
  path: { id: sessionID },
  body: {
    model: { providerID: "ollama", modelID: "qwen2.5-coder:3b" },
    agent: "pentest-builder",
    parts: [{ type: "text", text: prompt }],
  },
})

// 3) event-driven (SSE) — sumber kemajuan utama
const { stream } = await client.event.subscribe()
for await (const ev of stream) {
  if (ev.type === "session.idle" && ev.properties.sessionID === sessionID) break
  if (ev.type === "permission.updated") {
    // balas via client.postSessionIdPermissionsPermissionId(...)
  }
}

// 4) usage
const msgResult = await client.session.messages({ path: { id: sessionID } })
for (const { info } of unwrap(msgResult)) {
  if (info.role === "assistant") {
    tokens += info.tokens.input + info.tokens.output + info.tokens.reasoning
    cost += info.cost
  }
}
```

Catatan penting: `createOpencodeClient({ responseStyle: "data", throwOnError: true })`
berubah pada **runtime**, tetapi tipe generik method tetap default `"fields"`, sehingga
`tsc` tetap mengira hasilnya `{ data, error, ... }`. Gunakan default `"fields"` + helper
`unwrap` seperti di atas (ini yang dipakai di `agent/src/agent.ts`), atau kirim opsi
`responseStyle: "data"` per-request bila ingin tipe langsung.

`event.subscribe()` mengembalikan `{ stream: AsyncGenerator }`; tiap event adalah union
`Event` (`session.idle`, `message.updated`, `message.part.updated`, `file.edited`,
`todo.updated`, `permission.updated`, `session.error`, `session.diff`, dst). Ini
menggantikan polling dan memberi sinyal timeout yang lebih responsif. Pertahankan
polling ringan sebagai fallback bila SSE terputus.

### 2.3 Konfigurasi provider Ollama

docs/02 §6 hampir benar, kecuali key model. Bentuk `ProviderConfig` yang valid:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama (KubeRaya)",
      "options": { "baseURL": "http://ollama.satpam-benchmark.svc.cluster.local:11434/v1" },
      "models": {
        "huihui_ai/qwen3.5-abliterated:4B":        { "name": "Qwen3.5 4B Abliterated (uncensored)", "tool_call": true },
        "qwen3:4b":          { "name": "Qwen3 4B",          "tool_call": true },
        "qwen2.5-coder:3b":  { "name": "Qwen2.5 Coder 3B",  "tool_call": true }
      }
    }
  }
}
```

Peringatan: `tool_call: true` di config tidak membuat model benar-benar bisa tool
calling. Model 1.5b/3b punya kemampuan tool-call bervariasi; ukur dulu (trial sederhana
satu tool call) sebelum dipakai sebagai baseline. Siapkan jalur degradasi: prompt berbasis
format (agent menulis kode, bukan memakai tool) untuk model yang gagal tool calling.

## 3. Kritik arsitektur

### 3.1 Agentic loop belum dirancang

docs/02 §2.1 berhenti di "kirim prompt → tunggu idle → ambil pesan". Padahal tugas
"hasilkan proyek Python lengkap yang runnable dan findings valid" memerlukan loop:

- Kirim prompt awal.
- Amati event; hitung langkah/tool call.
- Saat idle, **verifikasi artefak** (file wajib ada, `findings.json` valid terhadap skema,
  `main.py` bisa dikompilasi).
- Jika gagal, kirim pesan perbaikan dengan pesan error spesifik (maks 3 putaran).
- Watchdog: timeout global, batas langkah, batas tool call, deteksi doom loop.
- Simpan checkpoint (transcript + run.json) agar bisa `--resume`.

Tanpa verifikasi + repair, metrik `repair_rounds` yang dijanjikan docs/02 §8 tidak akan
pernah ada, dan skor banyak ditentukan keberuntungan satu tembakan.

### 3.2 Permission headless

docs/02 §9 menyebut "prompt constraint + evaluator" dan "NetworkPolicy", tetapi **tidak
menyebut permission SDK**. Default `permission.*` adalah `"ask"`. Di server headless
tidak ada TUI untuk menjawab, sehingga request bash/edit akan menggantung atau ditolak
diam-diam. SDK punya `POST /session/{id}/permissions/{permissionID}` dengan body
`{ response: "once" | "always" | "reject" }` dan event `permission.updated`
(docs/02 tidak memakainya).

Dua pilihan:

- **(A) Konfigurasi statis** (direkomendasikan untuk benchmark): agent kustom
  `pentest-builder` dengan `permission.bash` allowlist per pattern dan `permission.edit:
  "allow"`. Deterministik, tidak bergantung timing event.
- **(B) Kebijakan dinamis di harness**: subscribe `permission.updated`, keputusan
  allow/reject berdasarkan policy code, balas lewat
  `client.postSessionIdPermissionsPermissionId(...)`. Fleksibel, tapi menambah race
  condition; semua permission request harus dijawab atau run hang.

Gunakan (A) untuk reproduksibilitas; (B) hanya bila perlu audit per-inti.

### 3.3 Keamanan: jangan andalkan prompt

docs/02 §5 meminta agen mematuhi scope, rate limit, non-destruktif. Model 1.5b/3b akan
sering melanggar (langkah berulang, curl ke host lain, payload DoS). Evaluator safety
(5%) hanya menghukum setelah fakta. Perlu defense-in-depth:

1. **Guard egress** (`satpam-guard`): proxy HTTP dalam namespace yang mengizinkan hanya
   host target dan menolak sisanya, plus rate limit global (mis. ≤10 req/s) dan ukuran
   body maksimum. Agent dan skrip hasil agent **wajib** lewat proxy (variabel
   `HTTP_PROXY`/`HTTPS_PROXY` atau `TARGET_BASE_URL` internal).
2. **NetworkPolicy** default-deny, allow hanya `runner → guard`, `guard → target`,
   `runner → ollama`, `runner → dns`. (docs/04 §5 allow langsung `runner → juice-shop`;
   ubah agar melewati guard.)
3. **Sandbox eksekusi artefak**: pod terpisah (`benchmark-executor`) dengan read-only root
   fs, `runAsNonRoot`, `seccomp=RuntimeDefault`, `capabilities: [drop ALL]`, CPU/mem
   terbatas, `emptyDir` workspace, tanpa secret, dan egress hanya ke guard.
4. **Deteksi pelanggaran**: `session.diff` untuk file di luar workspace; evaluator
   membandingkan request log guard dengan scope; transkrip disimpan untuk audit.

### 3.4 Artefak yang ditulis agent tidak bisa dipercaya

docs/03 §3 menyebut `run.json` "ditulis agent lewat `--out`". Ini ambigu dan salah arah:
metadata run (durasi, token, cost, status, daftar file) harus dikarang **harness** dari
`RunResult` yang dikembalikan modul agent, bukan oleh LLM (yang bisa mengarang token atau
menyembunyikan error). Agent hanya menulis artefak proyek Python di workspace. Pindahkan
penulisan `run.json` ke harness.

### 3.5 Determinisme & reprodusibilitas

- **Plugin eksternal**: `createOpencodeServer` tidak meneruskan `opencode serve --pure`,
  sehingga plugin global bisa mengubah perilaku agent antar run. Untuk benchmark,
  spawn manual `opencode serve --pure` dan pakai `createOpencodeClient`, atau pastikan
  plugin nonaktif dan catat daftar plugin.
- **State server**: opencode menyimpan session/config di direktori state. Set
  `OPENCODE_STATE_DIR`/`OPENCODE_DATA_DIR` (atau sandbox home) per run agar run bersih
  dan transkrip bisa diarsipkan.
- **Port**: jangan hardcode 4096; pakai port 0 dan parse URL dari stdout SDK.
- **Target reset**: "restart Deployment" **tidak** me-reset SQLite Juice Shop (data
  persist di volume). Reset dengan menghapus file DB / mereset volume, atau pakai image
  dengan storage ephemeral dan pod baru per run. Catat digest image di `run.json`.
- **Model pinning**: catat `modelID`, `providerID`, dan hash config/prompt di `run.json`.
- **Seed**: simpan `--seed`; dokumentasikan library RNG.

### 3.6 Infrastruktur

- **Artefak hilang**: Job + `emptyDir` berarti artefak hilang saat pod selesai. Butuh PVC
  (atau upload ke object storage) **sebelum** Job exit. docs/04 §4.3 menyebut upload S3,
  tapi NetworkPolicy §5 default-deny egress tidak mengizinkan endpoint S3 → kontradiksi.
  Tambahkan allow egress ke endpoint object storage, atau sidecar upload.
- **Kontensi 1 node**: Ollama CPU + runner + Juice Shop + monitoring di satu node.
  Benchmarking sambil inferensi akan membuat durasi/throughput tidak stabil. Jalankan
  inferensi dan evaluasi **sekuensial**, `requests`/`limits` eksplisit, dan catat metrik
  node (CPU/RAM/disk) per run. Pertimbangkan menjalankan Ollama di node lain (atau Luar
  cluster) bila memungkinkan.
- **Target sebagai Deployment**: lebih aman memakai pod per run (initContainer reset
  DB), bukan Deployment bersama.

### 3.7 Metodologi & statistik

- **Formula tidak konsisten**: docs/03 §5 memakai total berbobot yang sudah memuat
  reproducibility (0.10). docs/05 §5.1 memakai `total_task = mean(total_run) + 0.10 ×
  reproducibility` dengan `total_run` maks 90 — reproducibility dihitung dua kali dan
  skala jadi tidak jelas. Pilih satu: komponen reproducibility **khusus level task**,
  total run maks 90, total task = mean(total_run) + 0.10·repro (maks 100). Hapus
  reproducibility dari rumus total run.
- **Edge case discovery**: `precision = |A∩G|/|A|` tak terdefinisi bila `|A|=0`;
  `recall` tak terdefinisi bila `|G|=0`. Tentukan konvensi (mis. P=0 saat A kosong,
  R=0 saat G kosong, F1=0).
- **Evidence**: docs/03 §4.2 merata-ratakan kualitas hanya pada temuan yang match; bila
  nol match → tidak terdefinisi. Tentukan 0.
- **n≥5 untuk Wilcoxon** sangat lemah (daya rendah). Minimal n≥10, atau laporkan
  estimasi Bayesian/effect size + CI. Wilcoxon signed-rank memerlukan **pasangan** yang
  jelas: pasangkan per `(task, rep)` antar model dengan seed yang sama.
- **Multiple comparison**: 3 model × 10 task = 30 uji → terapkan Holm/Bonferroni atau
  FDR; laporkan p yang sudah dikoreksi.
- **Pass@k**: docs/03 §6 memadukan "proporsi task dengan ≥1 run sukses" (sebenarnya
  pass@1 pada level task) dengan pass@k klasik. Definisikan:
  `pass@k = 1 − C(n−s, k)/C(n, k)`, `s` = jumlah run sukses.
- **Biaya**: `agent_cost_usd` dari Ollama = 0, sehingga metrik tak bermakna. Ganti/
  tambahkan proksi biaya: CPU-second, peak RAM, energy estimate, dan "skor per 1M token".
- **Threshold 60/80/40** perlu dirasionalisasi (mis. dibanding baseline atau inexpensive
  model) agar tidak terlihat arbiter.

## 4. Arsitektur target

### 4.1 Diagram konteks

```mermaid
flowchart TB
    subgraph Repo["Monorepo (TypeScript)"]
        A["agent/ — OpenCodeAgent<br/>adapter SDK + loop + permission + metering"]
        H["harness/ — orchestrator, evaluator,<br/>aggregate, report, metrics"]
        T["harness/tasks/*.json<br/>task card + ground truth"]
    end

    subgraph K8s["KubeRaya 1-node"]
        subgraph NSB["satpam-benchmark"]
            J["benchmark-runner Job"]
            O["Ollama Deployment"]
            G["satpam-guard proxy"]
        end
        subgraph NSJ["juice-shop"]
            JS["Juice Shop (pod per run)"]
        end
        MON["Prometheus + Grafana"]
    end

    H --> A
    A -->|SDK HTTP| O
    H -->|Jawab artefak| JS
    A -.event.-> H
    J -->|HTTPS terbatas| G --> JS
    A -->|prompt| O
    H -.metrik.-> MON
```

### 4.2 Struktur direktori yang dibangun

```text
kaderisasi/
├── docs/                       # 01–06
├── agent/
│   ├── package.json            # @opencode-ai/sdk@1.19.6, zod, pino
│   ├── tsconfig.json
│   ├── opencode.agent.json     # config server per run (agent kustom + permission)
│   └── src/
│       ├── index.ts            # CLI: run --task ... --workspace ... --out run.json
│       ├── agent.ts            # lifecycle server + session + prompt + SSE/polling
│       ├── loop.ts             # state machine + repair + watchdog
│       ├── prompts.ts          # template prompt + task card injection
│       ├── workspace.ts        # kontrak artefak + validasi skema + leak check
│       ├── permission.ts       # konfigurasi/policy permission
│       ├── metering.ts         # token/cost/step/tool-call
│       ├── events.ts           # wrapper SSE + fallback polling
│       ├── types.ts
│       └── logger.ts           # log terstruktur (run_id, task_id, model, phase, event)
├── harness/
│   ├── package.json
│   ├── tsconfig.json
│   ├── tasks/                  # A01..A10.json (task card + ground truth)
│   └── src/
│       ├── cli.ts              # run | evaluate | aggregate | report
│       ├── orchestrator.ts     # jadwal (model, task, rep), seed, isolation
│       ├── runner.ts           # panggil agent, terima RunResult, tulis run.json
│       ├── evaluate.ts         # rubrik berbobot + keamanan
│       ├── groundtruth.ts      # normalisasi & pencocokan temuan
│       ├── aggregate.ts        # mean±SD, bootstrap CI, Wilson, Wilcoxon, CV, pass@k
│       ├── report.ts           # infografis HTML mandiri
│       ├── metrics.ts          # Prometheus exposition / pushgateway
│       └── types.ts
├── manifests/60-benchmark/
│   ├── kustomization.yaml
│   ├── namespace.yaml
│   ├── ollama.yaml
│   ├── guard.yaml
│   ├── juice-shop.yaml
│   ├── executor.yaml
│   ├── networkpolicy.yaml
│   ├── runner-job.yaml
│   └── monitoring.yaml
├── scripts/                    # seed target, reset, upload artefak
├── README.md                   # cara reproducible end-to-end
└── opencode.json               # config untuk mengembangkan repo ini (agent build)
```

## 5. Agentic loop (state machine)

### 5.1 States

```text
init → server_up → session_ready → prompting → running
      → verifying → (repair_n → prompting)*  → finalizing → done
      ↘ timeout / error / aborted → finalizing
```

### 5.2 Aturan loop

| Aturan | Nilai default | Alasan |
|---|---|---|
| `AGENT_TIMEOUT_MS` | 900_000 | batas global per run (SLO p95 ≤ 20 mnt) |
| `AGENT_MAX_STEPS` | 60 | cegah tool loop tak berhenti |
| `AGENT_MAX_TOOL_CALLS` | 120 | batas tool call kumulatif |
| `AGENT_MAX_REPAIR_ROUNDS` | 3 | docs/02 §8 |
| `AGENT_MAX_REQUESTS` | 300 | proxy menegakkan; harness menghitung |
| `AGENT_RATE_LIMIT_RPS` | 5 | docs/02 §5 (evaluator ≤10) |
| `REPAIR_BACKOFF_MS` | 1_000 | jeda antar perbaikan |

### 5.3 Alur per run

1. Buat workspace `workspaces/<run_id>/`, tulis `task.agent.json` (tanpa ground truth).
2. Nyalakan server (`createOpencodeServer`, `--pure` bila memungkinkan), buat session
   dengan `directory=workspace`.
3. Kirim prompt awal (role + task card + deliverables + aturan keamanan + self-test).
4. Konsumsi event: `message.updated`/`message.part.updated` (progres), `todo.updated`
   (progres), `permission.updated` (policy), `session.error` (gagal), `session.idle`
   (selesai). Fallback polling `session.status` tiap 2s.
5. Saat idle: validasi artefak (§6). Jika gagal, susun pesan perbaikan berisi daftar error
   spesifik, kirim lagi (maks 3). Catat `repair_rounds`.
6. Saat timeout/doom loop: `session.abort`, status `timeout`, simpan transkrip.
7. Kumpulkan usage (input/output/reasoning/cache), `cost`, langkah, tool call, diff.
8. Harness menulis `run.json` + `transcripts/<run_id>.json`, lalu mengevaluasi.

### 5.4 Kontrak antar modul

```ts
interface RunResult {
  runId: string
  taskId: string
  model: { providerID: string; modelID: string }
  status: "completed" | "timeout" | "error" | "aborted"
  workspace: string
  artifacts: { mainPy: string; findings: string; requirements: string; readme: string; extra: string[] }
  usage: { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number }
  cost: number
  steps: number
  toolCalls: number
  repairRounds: number
  requests: number
  durationMs: number
  errors: string[]
  diff: FileDiff[]
}
```

## 6. Kontrak artefak & validasi

### 6.1 File wajib (agent)

| File | Validasi |
|---|---|
| `main.py` | `python -m py_compile` sukses; menerima `--target`, `--output` |
| `findings.json` | skema Zod (§6.2); array; `id` unik |
| `requirements.txt` | ada; hanya pin versi; tak ada paket berbahaya |
| `README.md` | ada; menyebut cara menjalankan |

### 6.2 Skema findings (Zod)

```ts
const Finding = z.object({
  id: z.string(),
  title: z.string().min(1),
  owasp_id: z.string().regex(/^A\d{2}:2025$/),
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  endpoint: z.string().min(1),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]),
  evidence: z.string().min(1),
  payload: z.string().optional(),
  confidence: z.number().min(0).max(1),
  remediation: z.string().optional(),
})
```

### 6.3 Validasi & keamanan artefak

- **Skema**: gagal → repair round.
- **Kompilasi**: gagal → repair round.
- **Run ulang di sandbox**: `python main.py --target <scope> --output findings.reproduced.json`;
  bandingkan dengan `findings.json` agent (self-consistency).
- **Scope**: semua URL di artefak harus di dalam `scope` task; request log guard
  dibandingkan dengan scope → pelanggaran `SEVERE`.
- **Lembak workspace**: `session.diff` dipakai untuk memastikan tak ada file diluar
  workspace; tolak path absolut ke `/etc`, home, cloud metadata.
- **Determinisme artefak**: jangan pakai `latest`; pin image Python di executor.

## 7. Harness & evaluator

### 7.1 Pipeline

```bash
npm run dev -- run \
  --tasks ./tasks \
  --models huihui_ai/qwen3.5-abliterated:4B,qwen3:4b,qwen2.5-coder:3b \
  --runs 10 --target http://juice-shop.juice-shop.svc:3000 \
  --seed 42 --out ./runs
```

Orchestrator: untuk tiap model → shuffle task dengan seed → untuk tiap task → n rep
(sekuensial), buat workspace, panggil `agent`, tulis `run.json`, jalankan executor,
evaluasi, append `results.jsonl`.

### 7.2 Rubrik (final, setelah konsistensi docs/03 & docs/05)

```
total_run  = 0.40·Discovery + 0.20·Evidence + 0.15·Correctness
           + 0.10·CodeQuality + 0.05·Safety                     (maks 90)
total_task = mean(total_run) + 0.10·Reproducibility             (maks 100)
repro      = 100 · success_rate · (1 − min(CV, 0.5))
success_rate = proporsi run dengan ≥1 temuan inti ground truth
```

### 7.3 Pencocokan ground truth

Normalisasi temuan: kanonikasi endpoint (lowercase path, buang query trailing slash,
 collapses param), tipe kerentanan (ontology OWASP 2025), bukti minimal. Match
`endpoint + type` → hit. Pisahkan himpunan inti (`G_core`) dan pelengkap (`G_aux`).

### 7.4 Statistik

- mean ± SD per (model, task, kategori).
- CI 95%: bootstrap 1000-resample (percentile) untuk skor; Wilson untuk success rate.
- Pairing Wilcoxon: pasangkan per `(task, rep)` antar model dengan seed sama; Holm
  correction untuk 30 uji; laporkan effect size (mean diff + CI), bukan hanya p.
- pass@k dengan rumus kombinatorial; CV = SD/mean.
- Analisis kesalahan: frekuensi kelas + contoh transkrip.

### 7.5 Report

Bangun HTML mandiri dari `results.jsonl` + `summary.json` (tanpa CDN), mengikuti
docs/05 §3–§5. Sertakan: semua run (termasuk gagal), limitasi, hash prompt/config,
digest target, dan perintah reproduksi.

## 8. Konfigurasi OpenCode (agent per run + repo dev)

### 8.1 `agent/opencode.agent.json` (per run)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "autoupdate": false,
  "share": "disabled",
  "model": "ollama/huihui_ai/qwen3.5-abliterated:4B",
  "small_model": "ollama/qwen3:4b",
  "disabled_providers": ["anthropic", "openai", "google", "github-copilot"],
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "${OLLAMA_BASE_URL}" },
      "models": {
        "huihui_ai/qwen3.5-abliterated:4B":        { "name": "Qwen3.5 4B Abliterated (uncensored)", "tool_call": true },
        "qwen3:4b":          { "name": "Qwen3 4B",          "tool_call": true },
        "qwen2.5-coder:3b":  { "name": "Qwen2.5 Coder 3B",  "tool_call": true }
      }
    }
  },
  "agent": {
    "pentest-builder": {
      "mode": "primary",
      "description": "Builds a reproducible, non-destructive pentest script for one OWASP 2025 category",
      "maxSteps": 60,
      "tools": {
        "read": true, "write": true, "edit": true, "bash": true,
        "glob": true, "grep": true, "list": true,
        "webfetch": false, "websearch": false, "task": false, "todowrite": false
      },
      "permission": {
        "edit": "allow",
        "bash": {
          "python*": "allow", "pip*": "allow", "ruff*": "allow",
          "ls*": "allow", "cat*": "allow", "head*": "allow", "tail*": "allow",
          "curl*": "allow", "echo*": "allow", "mkdir*": "allow",
          "*": "deny"
        }
      }
    }
  }
}
```

Catatan: `tools`/`permission` membatasi alat di sisi server; guard proxy tetap bertugas
sebagai enforcement kedua. Prompt harus menyatakan `scope` dan batas laju.

### 8.2 `opencode.json` repo (untuk mengembangkan repo ini)

Minimal: `provider.ollama`, `agent.build` permission, `autoupdate:false`,
`disabled_providers` lain, dan `plugin` kosong. Tambahkan `AGENTS.md` berisi konvensi
(khususnya: jangan menulis komentar kecuali diminta, ikuti gaya yang ada).

### 8.3 Metering

- Token/usage dari `AssistantMessage.tokens` (input/output/reasoning/cache) dan `cost`.
- Hitung `steps` dari jumlah assistant turn dan `tool_calls` dari parts berjenis tool.
- `agent_cost_usd` Ollama = 0; tambahkan `agent_cpu_seconds`, `agent_ram_peak_mb`, dan
  energi estimasi. Laporkan "skor per 1M token" untuk efisiensi.

## 9. Keamanan (defense-in-depth)

| Lapisan | Kontrol |
|---|---|
| Prompt | role, scope, non-destruktif, rate limit, self-test, format jawaban |
| Config | agent kustom, `tools` dibatasi, `permission.bash` allowlist |
| Jaringan | NetworkPolicy default-deny; egress hanya guard + Ollama + DNS |
| Proxy | `satpam-guard`: allowlist host target, rate limit, body limit, log request |
| Eksekusi | pod executor non-root, read-only fs, seccomp, drop caps, CPU/mem limit |
| Data | tanpa secret di env; workspace per-run; transkrip terarsip |
| Evaluator | cek scope dari request log, cek payload destruktif, safety hard gate |

## 10. Observability & SRE

- Log terstruktur: `run_id`, `task_id`, `model`, `phase`, `event`, `duration_ms`.
- Metrik: `agent_run_duration_seconds`, `agent_tokens_in/out`, `agent_cost_usd`,
  `agent_steps`, `agent_tool_calls`, `agent_status`, `artifact_files`, `artifact_loc`,
  `score_total`, `score_discovery`, `agent_requests_total`, `agent_safety_violations`.
- Job umur pendek → pakai Pushgateway atau endpoint `/metrics` yang di-scrape sebelum
  exit; `results.jsonl` adalah source of truth.
- SLO: success rate ≥ 90% per model; p95 durasi ≤ 20 mnt; safety violation = 0;
  token per run ≤ 200k; target reset sukses 100%.
- Alert: `agent_status{status!="completed"} > 0` 10 mnt; `score_total` turun >20% antar
  batch; guard menolak >0 pada host di luar scope.

## 11. Roadmap & definisi selesai

### Tahap 1 — Agent MVP

- [ ] `agent/src/agent.ts` menghidupkan server, session, prompt, SSE + fallback polling.
- [ ] Verifikasi artefak + 1 repair round.
- [ ] Timeout & abort berfungsi; transkrip + usage tersimpan.
- [ ] Uji terhadap Ollama lokal (model 3b) satu task A05.

### Tahap 2 — Harness

- [ ] Orchestrator + `run.json` + `results.jsonl`.
- [ ] 10 task card + ground truth.
- [ ] Evaluator discovery/evidence/correctness/code/safety + reproducibility.
- [ ] Agregasi + report HTML; seed & `--report-only`.

### Tahap 3 — Infra

- [ ] Manifest Ollama, guard, Juice Shop, executor, NetworkPolicy, Job.
- [ ] Reset target per run; upload artefak sebelum Job exit.
- [ ] Prometheus/Grafana; dashboard metrik agent.

### Tahap 4 — Eksperimen

- [ ] n≥10 per (model, task), 3 model, seed tersimpan.
- [ ] Laporan statistik lengkap + analisis kesalahan.
- [ ] Infografis publik; README reproducible.

## 12. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Model 1.5b/3b gagal tool calling | uji kemampuan dulu; sediakan jalur prompt-format; laporkan sebagai temuan |
| Permission "ask" menggantung run | agent kustom `permission` allowlist; jangan bergantung event |
| Plugin ekstabilkan perilaku | `opencode serve --pure` / plugin nonaktif; catat versi |
| Target tak benar-benar reset | reset DB/volume; pod baru per run; catat digest |
| Artefak hilang (emptyDir) | PVC/upload sebelum exit |
| Kontensi node | sekuensial; resource pin; catat metrik node |
| Formula ganda/inkonsisten | pilih satu rumus (§7.2); tambahkan tes unit evaluator |
| n kecil / multi-test | n≥10; Holm; effect size + CI; pertimbangkan Bayesian |
| Evidence subjektivitas | rubrik eksplisit + double-blind 20% sampel |
| Biaya Ollama = 0 | laporkan CPU/RAM/energi + skor per token |
| Kebocoran ground truth | `task.agent.json` strip ground truth; harness pegang GT |

## Lampiran A — Daftar file yang harus dibuat (minimum viable)

1. `README.md`
2. `agent/package.json`, `tsconfig.json`, `opencode.agent.json`, `src/{index,agent,loop,prompts,workspace,permission,metering,events,types,logger}.ts`
3. `harness/package.json`, `tsconfig.json`, `src/{cli,orchestrator,runner,evaluate,groundtruth,aggregate,report,metrics,types}.ts`
4. `harness/tasks/A01..A10.json`
5. `manifests/60-benchmark/*`
6. `docs/06-review-arsitektur-dan-harness.md` (file ini)

## Lampiran B — Perintah reproduksi (target)

```bash
# lokal
cd agent && npm i && npm run dev -- --task ../harness/tasks/A05.json \
  --workspace ../runs/ws --out ../runs/run.json
cd harness && npm i && npm run dev -- run --tasks ./tasks --models huihui_ai/qwen3.5-abliterated:4B,qwen3:4b,qwen2.5-coder:3b \
  --runs 10 --target http://127.0.0.1:3000 --seed 42 --out ./runs
npm run dev -- aggregate --results ./runs/results.jsonl --out ./runs/summary.json
npm run dev -- report --results ./runs/results.jsonl --out ./runs/report

# KubeRaya
kubectl apply -k manifests/60-benchmark
kubectl apply -f manifests/60-benchmark/runner-job.yaml
```
