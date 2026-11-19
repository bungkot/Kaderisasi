# 04 — Infra & SRE dengan Docker Compose

Dokumen ini menjelaskan lapisan infrastruktur portfolio: bagaimana **Ollama**, **target Juice Shop**, dan **benchmark runner** dioperasikan via [`docker-compose.yml`](../docker-compose.yml), dengan disiplin SRE (isolasi dasar, observability, SLO, biaya, reprodusibilitas).

> Setup lokal single-host — semuanya di dalam `docker-compose.yml`, tanpa setup infra tambahan.

## 1. Tujuan

| Kebutuhan | Solusi |
|---|---|
| Inferensi model coding lokal | Service `ollama` (image `ollama/ollama:latest`, port 11434) |
| Target adversarial terisolasi | Service `juice-shop` (image `bkimminich/juice-shop:v17.1.0`, port 3000 → host) |
| Runner benchmark reproducible | Service `harness` (profile `bench`) — workspace baru per run, artefak per run |
| Isolasi komunikasi dasar | Semua service pada project docker compose; runner → `juice-shop:3000` |
| Biaya terkendali | Timeout runner 900000 ms; artefak di volume `./runs` |

## 2. Topologi

```text
harness (profile bench)
├─ SDK HTTP → ollama:11434 (inferensi)
└─ HTTP terbatas → juice-shop:3000 (target)
```

Model di-tarik oleh service `model-init` (depends_on `ollama`): `huihui_ai/qwen3.5-abliterated:4B`, `qwen3:4b`, `qwen2.5-coder:3b`.

## 3. Deploy

```bash
docker compose --profile bench up --build harness
```

### Artefak per run

- `./runs/results.jsonl` — record per run (`run.json`, `evaluation.json`, `task.agent.json`)
- `./runs/summary.json`, `./runs/report/`
- `./workspaces/<run-id>/` — artefak per run
- `./transcripts/<run-id>.json`

## 4. Reprodusibilitas

1. Pin image Juice Shop & Ollama (versi + digest).
2. Catat versi target + model + seed di tiap `run.json`.
3. Seed randomisasi urutan task (`--seed`) disimpan.
4. Timeout & model dibatasi oleh service `harness` (timeout 900000 ms).
5. Semua run disimpan (termasuk gagal).

## 5. Limitasi lokal

- Single host; Ollama default tanpa konfigurasi GPU khusus di compose.
- Tidak ada NetworkPolicy/isolasi default; ekstensi via `networks:` di compose jika diperlukan.
