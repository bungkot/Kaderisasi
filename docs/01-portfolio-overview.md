# 01 — Portfolio Overview (untuk Rekruter)

## 1. Siapa & apa yang dibangun

Saya membangun **Agentic Pentest Script Generation Benchmark**: sebuah **Coding Agent** berbasis **TypeScript · OpenCode SDK · Ollama** yang secara otonom menulis proyek **script Python** ke *workspace*, menjalankannya terhadap target rentan (**OWASP Juice Shop**), lalu mengukur keberhasilannya dengan **metodologi eksperimen sistematis** berstandar **OWASP Top 10:2025**.

Tiga fokus portfolio dan bagaimana mereka terwujud:

| Fokus | Bukti kerja |
|---|---|
| **Coding Agent** | `agent/` — integrasi OpenCode SDK, session/tools, prompt engineering, safety constraints, usage metering |
| **Kubernetes** | Ollama serving, target, runner, NetworkPolicy, monitoring di KubeRaya (1-node) — `manifests/` |
| **SRE** | metrik pipeline, SLO, statistik benchmark, reproducibility, cost awareness — `harness/`, `docs/03`, `docs/04` |

## 2. Masalah & pertanyaan riset

> *Sejauh mana coding agent berbasis LLM lokal (Ollama) mampu menghasilkan proyek script penetration-testing yang benar, reproduktif, aman, dan efisien untuk tiap kategori OWASP Top 10:2025?*

Masalah yang ingin dijawab:
1. LLM code generation sering "black box" — bagaimana mengukur kapabilitas nyata pada domain security?
2. Bagaimana mengevaluasi agen secara **scientific** (kontrol, repeat, statistik), bukan sekadar demo?
3. Bagaimana mengoperasikannya dengan disiplin **SRE** (observability, SLO, biaya) di **Kubernetes**?

## 3. Ringkasan metode (satu paragraf)

Untuk 10 task (A01–A10) × ≥3 model × n≥5 run, agent menerima task card dan harus menghasilkan proyek Python lengkap di workspace. Artefak dijalankan pada target terisolasi, dievaluasi dengan rubrik berbobot (discovery 40%, evidence 20%, correctness 15%, reprodusibilitas 10%, code quality 10%, safety 5%), lalu diagregasi dengan mean ± SD, interval kepercayaan, dan analisis kesalahan.

## 4. Peta bukti (evidence map)

| Klaim kemampuan | Bukti |
|---|---|
| Merancang agent loop otonom | `agent/src/agent.ts`, `agent/src/loop.ts`, `agent/src/events.ts`, transcript per run |
| Prompt engineering & safety | `agent/src/prompts.ts`, `agent/src/permission.ts` |
| Integrasi SDK/model | `agent/src/permission.ts` (`buildAgentConfig`), `agent/opencode.agent.json`, `opencode.json` |
| Evaluasi ilmiah | `docs/03-benchmark-methodology.md`, `harness/src/evaluate.ts`, `harness/src/aggregate.ts` |
| Kubernetes | `manifests/60-benchmark/**` (Ollama, guard, target, NetworkPolicy, monitoring), `scripts/guard.py` |
| SRE/observability | `docs/04-infra-sre-kuberaya.md`, `harness/src/metrics.ts`, metrik `agent_*` |
| Reprodusibilitas | perintah di `README.md`, artefak `results.jsonl`, `harness/src/report.ts` |

## 5. Matriks skill yang ditunjukkan

| Skill | Lingkup |
|---|---|
| TypeScript/Node | agent service, harness, CLI |
| OpenCode SDK | session, tools, events, usage |
| LLM/Ollama | provider config, model selection, GPU-less inference |
| AI Applied Engineering | prompt design, agent loop, repair iterations, eval harness |
| Security (OWASP 2025) | task design, ground truth, evidence rubric |
| Kubernetes | manifests, namespace isolation, policy, scheduling |
| SRE | metrik, SLO, alerting, reliability benchmark, cost |
| Data/Statistik | experiment design, CI, pass@k, error analysis |
| Komunikasi | laporan infografis untuk等非-teknis |

## 6. Status & langkah berikutnya

| Tahap | Status |
|---|---|
| 1. Agent scaffold + SDK | ✅ |
| 2. Harness + 10 task | ✅ |
| 3. Ollama di KubeRaya | ✅ manifest (perlu deploy) |
| 4. Eksperimen & hasil | ⏳ |
| 5. Infografis publik | ⏳ |

## 7. Prinsip integritas

- Hasil negatif/degenerate **tetap dilaporkan**.
- Tanpa cherry-picking; semua run disimpan.
- Pengujian hanya pada lab milik sendiri.
