# Agent runtime and workspace contract

## Runtime

The agent is run from `agent/src/index.ts` and uses the V2 client
`@opencode/client` to communicate with an OpenCode 2 server. Each run spawns
`opencode serve` with an isolated `HOME`, `OPENCODE_CONFIG_CONTENT`, and
`OPENCODE_PASSWORD`. The embedded `@opencode/sdk` client is not used because it
requires Node 24+ (`await using`), while this repository runs on Node 22. The
per-run config is built by `buildAgentConfig` in `agent/src/permission.ts`. The
default benchmark agent name is `pentest-builder`; the model is supplied through
the OpenCode Ollama provider.

The config uses the native V2 form: `providers`, `agents`, `policies`, and
`permissions`. The Ollama provider carries
`body.reasoning_effort: "none"` to disable Qwen3 reasoning via the
OpenAI-compatible API; tool definitions are still sent. The `body` field only
works with the `providers` form (V2), not `provider` (V1).

Runtime flow:

1. Create a unique directory under `workspaceRoot` and store the sanitized task
   card.
2. Create an OpenCode session with that directory as the location.
3. Send the prompt, then wait for `experimental.session.wait` and the
   `session.idle` or `session.execution.failed` event.
4. When the session is idle, validate the artifacts and `findings.json`;
   `main.py` is checked with `python3 -m py_compile`.
5. If validation fails, send the validation error as a repair prompt until
   `maxRepairRounds` is reached.
6. Save the transcript, usage, and session diff; changes outside the workspace
   set the run status to error.

The defaults defined in `shared/src/constants.ts` are: a 15-minute timeout, a
maximum of 60 steps, and 3 repair rounds. The timeout can be overridden through
the CLI. Tool calls are counted after the session finishes; the `maxToolCalls`
value present in the options is not yet applied as a runtime limit. Even the
applied config values are not a guarantee that every model operation is safe.

## Required artifacts

Each run workspace must contain:

| File | Contract |
|---|---|
| `main.py` | Python CLI that accepts `--target` and `--output` |
| `findings.json` | Array of findings conforming to `FindingsSchema` |
| `requirements.txt` | List of project dependencies |
| `README.md` | Usage instructions and a brief explanation |

Additional files are allowed. The validator currently checks for the presence
of the four files, JSON parsing and the findings schema, and syntax compilation
of `main.py`. The validator does not run a linter, does not audit dependencies,
and does not prove that the findings are correct or that the script is safe.

A finding has `id`, `title`, `owasp_id`, `severity`, `endpoint`, `method`,
`evidence`, `confidence`, and the optional fields `payload` and `remediation`.
The canonical form is in `shared/src/schema.ts`.

## Security and authorization limits

- Use only lab targets that you own or have written permission for. The
  benchmark target and scope are formed from the target URL given to the runner.
- The generated script may contain network requests and can be run through agent
  tools. Review the code before executing it outside a controlled lab run.
- OpenCode policy restricts tools and command patterns, but it is not an OS
  sandbox. Some allowed commands, including `curl`, can access the network.
- In V2, the `doom_loop` action is no longer available, so the old
  `doom_loop: "deny"` restriction cannot be applied; `webfetch`, `websearch`, `subagent`,
  `skill`, `question`, and `external_directory` are still denied through `permissions`.
- Disabling reasoning changes model behavior and cost, but does not guarantee
  reasoning-free output on other models or runtimes.
- The diff check detects file paths outside the workspace reported by the
  session; this is not comprehensive filesystem access prevention.
- The evaluator currently does not monitor all HTTP requests made by the script,
  so it does not prove that every request stays within scope.
- Do not place credentials, personal data, or secrets in the task, prompt,
  workspace, transcript, or logs. Do not test with DoS or destructive data
  changes.

Accordingly, the current implementation is suitable for controlled experiments
on a local lab, not for claiming production-grade security isolation.

## Brief troubleshooting

- Run `agent ... toolcheck` to check the model's tool calling before
  experimenting. A 120 s timeout can expire during prompt processing on slow
  CPU-only inference; use `--timeout-ms 600000` in that case. Confirmed trials
  on small models produced no tool call; see
  [Low-memory trial findings](./low-memory-trial-findings.md).
- Ensure the `opencode` CLI, Ollama, the selected model, and `python3` are
  available. On Windows the CLI must be reachable as a native executable, not
  only as a `.cmd`/`.ps1` shim.
- If a run reports `agent_timeout` while its transcript already contains an
  `idle` message, inspect the session-wait and event handling path; this was
  observed in a confirmed trial and is not yet explained by the source.
- Check the structured logs, `transcripts/<run-id>.json`, `run.json`, and
  `errors` if the run status is not `completed`.
- Artifact repair is performed only up to the configured repair limit; failed
  runs are still saved by the harness.
