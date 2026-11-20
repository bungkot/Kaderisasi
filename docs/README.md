# Documentation

This documentation describes the implementation present in the repository, not a
blueprint for components that have not yet been built. Start with
[architecture](./architecture.md), then use the guide appropriate to your work:

| Document | Purpose |
|---|---|
| [Architecture](./architecture.md) | Workspace responsibility boundaries and benchmark flow |
| [Agent runtime](./agent-runtime.md) | Agent lifecycle, artifact contract, and safety boundaries |
| [Evaluation](./evaluation.md) | OWASP tasks, ground truth, scores, and statistics |
| [Operations](./operations.md) | Prerequisites, local commands, and Docker Compose |
| [Low-memory Docker trial](./docker-desktop-4gb.md) | Experimental Compose override for a ~4 GB Docker Desktop VM |
| [Low-memory trial findings](./low-memory-trial-findings.md) | Confirmed results and limits of the experimental low-memory stack |
| [Reporting](./reporting.md) | Result artifacts and HTML reports |

## Scope

This project evaluates a local coding agent based on TypeScript, the OpenCode
V2 client, and Ollama that assembles a Python script project for OWASP Top
10:2025 tasks in a separate workspace. The current task uses OWASP Juice Shop as the lab target.
This is not a general scanning service or authorization to test third-party
systems. Run it only against targets you own or whose testing has been explicitly
authorized.

## Verifiable status

- The agent, harness, ten tasks, aggregation, and report renderer implementations
  are present in the repository.
- Docker Compose provides Ollama, Juice Shop, and an optional benchmark runner.
- The Compose runner mounts the host `opencode` binary via `OPENCODE_BIN` and
  reaches the agent loop. Confirmed trials show that a 15-minute run also times
  out with `qwen2.5:1.5b`: the model emits no tool call and the session idle
  event was not acted on by the loop. No complete script has been produced yet;
  see [Low-memory trial findings](./low-memory-trial-findings.md).
- Evaluation and safety controls are currently based on artifact validation and
  heuristics; network boundaries and isolated execution are not yet enforced by
  the repository.
- Score figures or performance claims can only be made after experiments have
  been run and their result artifacts reviewed.

See the [main README](../README.md) for the quick start and the
[agent development instructions](../AGENTS.md) for repository conventions.
