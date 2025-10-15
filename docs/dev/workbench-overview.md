---
title: Integration Workbench Overview
description: Prototype orchestration runtime for API → Event → Data workflows.
---

# Integration Workbench Prototype

The Integration Workbench demonstrates chained protocol execution across simulated **API → Event → Data** agents. It ships with a lightweight runtime, CLI entry points, and a CI-ready benchmark harness that validates latency and concurrency guardrails.

## Runtime Components

- `src/workbench/runtime/agent-runner.{ts,js}`  
  Normalises agent adapters (API/Event/Data), tracks timing metrics, and exposes a consistent execution contract for workflow steps.
- `src/workbench/runtime/orchestrator.{ts,js}`  
  Coordinates sequential and parallel steps, resolves data dependencies (`{{step-id}}`), and aggregates latency/throughput metrics for downstream reporting.

Both modules are dependency-free aside from Node built-ins and plug into existing CLI UX helpers.

## CLI Commands

Routed through `app-cli`:

```bash
# Execute a workflow definition (YAML or JSON)
node app/cli/index.js workbench run --workflow ./examples/workflow.yaml

# Run the canned CI benchmark and emit perf-results.json
node app/cli/index.js workbench bench --iterations 5 --format json
```

`workbench run` prints a concise summary (text or JSON) and can persist the full execution transcript via `--output`. `workbench bench` calls the shared script, writes `/reports/workbench/perf-results.json`, and returns aggregate metrics for CI gating.

## Benchmark Script

- `scripts/bench/workbench-ci-benchmark.js` powers both CLI and automation workflows.
- Generates deterministic workflows with controlled latencies, ensuring `p95 ≤ 2000 ms` and max concurrency ≤ 8.
- Produces append-friendly JSON artifacts for historical trend analysis.

## Validating Changes

```bash
# Targeted Jest coverage
npm test -- --runTestsByPath tests/workbench/integration-workbench.test.ts

# Manual dry runs
node app/cli/index.js workbench run --workflow ./your-workflow.yaml --format json
node app/cli/index.js workbench bench --format text
```

These commands confirm orchestration logic, CLI wiring, and benchmark outputs without invoking external services.
