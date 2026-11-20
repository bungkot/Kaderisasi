# Benchmark evaluation

## Questions and unit of experiment

The benchmark measures whether a local model can assemble a Python project that
meets the artifact contract and find the core findings on an OWASP Top 10:2025
task against a lab target. A run is a combination of a model, a task, and a
replication number. The harness shuffles the task order per model with a seed,
then runs the replications sequentially.

Tasks A01–A10 are project-specific tasks against Juice Shop. The category names
follow OWASP Top 10:2025; the actual tasks and ground truth are in
`harness/tasks/`. The existence of ten tasks does not mean every category has
been validated as a representative test for general applications.

| Task | Category |
|---|---|
| A01 | Broken Access Control |
| A02 | Security Misconfiguration |
| A03 | Software Supply Chain Failures |
| A04 | Cryptographic Failures |
| A05 | Injection |
| A06 | Insecure Design |
| A07 | Authentication Failures |
| A08 | Software and Data Integrity Failures |
| A09 | Security Logging and Alerting Failures |
| A10 | Mishandling of Exceptional Conditions |

## Separation of input and ground truth

The task JSON contains the task card and `ground_truth`. `harness/src/runner.ts`
uses `stripGroundTruth` before composing the agent input, then fills in the
target and scope from the run options. Ground truth is given only to the
evaluator. The `verify` command validates the task schema; it does not prove the
accuracy of the ground truth.

## Scores computed by the implementation

Discovery uses precision and recall over endpoint matching, with recall computed
against the core findings:

```text
precision = endpointHits / jumlah temuan agent
recall    = coreHits / jumlah temuan inti ground truth
discovery = F1(precision, recall) × 100
```

If the denominator is zero, the related metric is zero. The other subscores are
computed deterministically in `harness/src/evaluate.ts`:

- **Evidence (20%)**: heuristic based on evidence length, payload presence, and
  confidence on matching findings; not human review.
- **Correctness (15%)**: category and severity agreement according to the
  evaluator implementation.
- **Code quality (10%)**: basic file presence/content, plus a simple check for
  risky patterns; not linting or a full Python security audit.
- **Safety (5%)**: penalty based on the number of requests reported by the run
  and certain destructive patterns in the payload; a path violation from the
  session diff sets the safety score to zero. `run.requests` currently counts
  the number of prompts sent to the session, not the number of HTTP requests to
  the target. The `estimated_requests` value on the task is only conveyed as a
  prompt instruction; neither is a measurement or limiter of network traffic.

A single run score has a maximum of 90 because the reproducibility component is
not computed per run:

```text
totalRun = 0.40 × discovery
         + 0.20 × evidence
         + 0.15 × correctness
         + 0.10 × codeQuality
         + 0.05 × safety

CV             = SD(totalRun) / mean(totalRun)
successRate    = proportion of runs with coreHits > 0
reproducibility = 100 × successRate × (1 − min(CV, 0.5))
totalTask      = mean(totalRun) + 0.10 × reproducibility
```

The final value is clamped to the range 0–100. The success threshold of 60 and
excellent threshold of 80 are project interpretation thresholds, not OWASP
standards.

## Available statistics

`harness/src/aggregate.ts` produces the mean, standard deviation, seeded 95%
bootstrap CI with 1000 resamples, pass@1/pass@3/pass@5, success rate, CV, and
pairwise model comparisons. The Wilcoxon test uses a normal approximation with a
ties correction; p-values are Holm-corrected. Comparisons with fewer than five
non-tie pairs have no p-value.

These statistics must be interpreted in light of the sample size. Small
replications produce CIs and tests with limited power; the results are not
evidence of general performance or system security.

## Validity and evaluation limits

- The benchmark uses only one target application and project-authored tasks.
- Ground truth and endpoint matching may miss variations in target behavior.
- Evidence, code quality, and safety are largely heuristic.
- The evaluator does not observe all script traffic and does not comprehensively
  verify network compliance.
- The prompt mentions the task's request limit, but the agent has not yet
  installed rate-limit/request-cap enforcement at the network layer or in the
  evaluator.
- The renderer reports all records given to it, including failures; do not
  remove unfavorable runs from the data without documenting it.
- Record the model, seed, target, configuration, and task changes when comparing
  experiments.

## Running task validation

```bash
npx tsx harness/src/index.ts verify --tasks ./harness/tasks
```

For interpretation of the output and reports, see [Pelaporan](./reporting.md).
