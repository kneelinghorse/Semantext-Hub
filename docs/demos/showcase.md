# Demo Showcase Walkthrough

This walkthrough assembles the curated order-fulfillment showcase and exercises the import → validate → visualize loop end to end.

## Prerequisites
- Node 18+
- repository dependencies installed (`npm install`)
- Clean working directory (script overwrites `artifacts/catalogs/showcase/catalog-graph.json`; pass `--dry-run` to preview)

## Step 1 — Curated Manifests
The showcase uses three manifests located under `approved/`:
- `approved/demo-api/manifest.json` — `urn:proto:api:demo.showcase/order-api@v1.0.0`
- `approved/demo-event/manifest.json` — `urn:proto:event:demo.showcase/order-placed@v1.0.0`
- `approved/demo-workflow/manifest.json` — `urn:proto:workflow:demo.showcase/order-fulfillment@v1.0.0`

Each file contains provenance metadata that points back to the seeds used for the API and event definitions. The workflow document references this guide for traceability.

## Step 2 — Run the Showcase Pipeline
Execute the automation script from the workspace root:

```bash
node scripts/demo/run-showcase.mjs --overwrite
```

The script copies the curated manifests into `artifacts/catalogs/showcase/`, validates them while building a canonical graph, and exports `artifacts/diagrams/showcase.drawio`. Use `--dry-run` to verify inputs without writing artifacts.

## Step 3 — Inspect Artifacts
- `artifacts/graphs/showcase/catalog-graph.json` — canonical graph describing the curated protocols
- `artifacts/diagrams/showcase.drawio` — Draw.io visualization generated from the graph
- `artifacts/catalog-graph.json` remains untouched so the showcase stays isolated

To list only the curated protocols:
```bash
node cli/index.js catalog list --workspace . --format json | jq '[.[] | select(.urn | startswith("urn:proto:demo.showcase/"))]'
```

The command should emit three entries (API, event, workflow) with relationships matching the URNs above.

## Step 4 — Next Integration Steps
- Import `artifacts/catalogs/showcase/catalog-graph.json` into the viewer or registry as needed
- Use `node cli/index.js catalog generate-diagram` with a different `--output` to create themed variants
- Extend the automation script with additional manifests (agents, data stores) to broaden the demo story
