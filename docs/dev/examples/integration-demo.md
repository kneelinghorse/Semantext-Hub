---
title: Integration Workbench Demo
description: End-to-end API → Event → Data walkthrough using the Sprint 14 workbench.
---

# Integration Workbench Demo

This demo packages a realistic customer order flow to illustrate how the Integration Workbench chains **API → Event → Data** agents. It complements the prototype runtime (`B14.1`) and exporter missions (`B14.2`–`B14.4`) with runnable documentation.

- Workflow definition: `app/examples/integration/workbench-demo.yaml`
- Generated diagrams:
  - Draw.io — [`app/artifacts/examples/integration-diagram.drawio`](../../../artifacts/examples/integration-diagram.drawio)
  - Cytoscape JSON — [`app/artifacts/examples/integration-diagram.json`](../../../artifacts/examples/integration-diagram.json)
- Automated test: `app/tests/examples/integration-demo.test.ts`

## Workflow Overview

The workflow simulates the lifecycle of a customer order:

1. `submit-order` (API) accepts the inbound request and enriches metadata.
2. `event-and-audit-fanout` fans out in parallel:
   - `emit-order-received` (Event) broadcasts `order.received`.
   - `buffer-audit-log` (Data) stages an audit entry for compliance.
3. `persist-ledger` (Data) merges API and event payloads into the ledger store.
4. `notify-crm` (Event) notifies downstream CRM consumers using the ledger entry.
5. `generate-report` (Data) snapshots reporting metrics for analytics.

Each step caps simulated latency under 50 ms for fast local runs while the metrics emitted by the adapters preserve realistic values (p95 ≤ 2000 ms).

## Running the Demo Workflow

From the repository `app/` directory:

```bash
node cli/index.js workbench run --workflow ./examples/integration/workbench-demo.yaml --format table
```

This prints execution metrics, including total latency, step timings, and the max concurrent agents observed. Switch `--format json` to capture structured output suitable for CI pipelines or tests.

To validate performance guardrails and persist a transcript:

```bash
node cli/index.js workbench run \
  --workflow ./examples/integration/workbench-demo.yaml \
  --format json \
  --output ./artifacts/examples/integration-demo-run.json
```

## Exporting Visualizations

The Draw.io (`integration-diagram.drawio`) and Cytoscape (`integration-diagram.json`) artifacts encode the same topology:

- Nodes: API ingress, Event distributor, Audit buffer, Ledger persistence, CRM notifier, Analytics snapshotter.
- Edges: capture both sequential dependencies and the fan-out from the parallel step.

Update the diagrams whenever the workflow evolves:

1. Open `app/artifacts/examples/integration-diagram.drawio` in [diagrams.net](https://app.diagrams.net/) (or run `node cli/index.js catalog generate-diagram --output ./artifacts/examples/integration-diagram.drawio --overwrite` from `app/` to regenerate from the canonical catalog).
2. Export the Cytoscape payload with:

   ```bash
   node cli/commands/catalog-export.js \
     --workspace . \
     --format cytoscape \
     --output ./artifacts/examples/integration-diagram.json \
     --overwrite \
     --silent
   ```

> Both exporters share theme configuration with Sprint 14's style service (`app/docs/dev/workbench-overview.md`).

## Test Coverage

`app/tests/examples/integration-demo.test.ts` ensures the workflow loads, executes through the workbench CLI, and validates the documentation links to existing artifacts. Include it in CI via `npm test -- --runTestsByPath tests/examples/integration-demo.test.ts`.
