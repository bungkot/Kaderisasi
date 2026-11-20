# Artifacts and reporting

## Benchmark output

For each model, task, and replication, the harness stores:

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

Model paths are sanitized for directory names. `results.jsonl` contains one
`{ "run": ..., "evaluation": ... }` object per line. The harness writes
`run.json`, `evaluation.json`, a copy of the agent task, aggregates, and metrics.
The agent stores the transcript and workspace artifacts. In single-agent CLI
mode, the `--out` option stores the `RunResult` without evaluation.

`task.agent.json` must not contain ground truth. Treat transcripts and artifacts
as experiment data that may contain URLs or target input; review them before
sharing.

## Regenerating aggregates and HTML

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

The HTML report is self-contained without a CDN. The current implementation
displays summary cards, a per-model table, a task × model heatmap, score bars
with CI, error class counts, model comparisons, limitations, and reproduction
commands. It does not generate a radar chart or perform human review.

## Interpretation

- CI and p-value come from the statistical implementation in
  `harness/src/aggregate.ts`; method notes are included in `summary.json`.
- Evidence and safety are heuristics, not a security certification.
- Scores must be read together with the number of runs, error status, tasks, and
  validity limits in [Evaluation](./evaluation.md).
- Do not present the report as an official OWASP result or as a result of
  scanning a production system.
