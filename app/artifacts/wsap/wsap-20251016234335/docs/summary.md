# WSAP Session wsap-20251016234335

- Started: 2025-10-16T23:43:35.778Z
- Completed: 2025-10-16T23:43:35.891Z
- Seed: github-api
- Draft manifest: drafts/api-manifest.draft.json
- Approved manifest: approved/api-manifest.approved.json
- Catalog graph: catalog/catalog-graph.json
- Draw.io diagram: drawio/catalog.drawio
- Cytoscape export: cytoscape/catalog.json
- Metrics log: ../../../../artifacts/perf/2025-10-16/wsap-20251016234335.jsonl

## Durations (ms)

- import: 23.847
- approve: 8.131
- catalog: 2.369
- diagram: 8.95
- cytoscape: 1.571
- docs: 0.022
- registry: 38.188
- a2a: 20.861
- report: 0.379
- sign: 1.233
- open: 0.029

## Aggregated Metrics
- ingest: 31.978ms (ok=true)
- plan: 14.553ms (ok=true)
- runtime: 59.049ms (ok=true)

## Performance Budgets: PASS

## Multi-Agent Registry

- Registry URL: http://127.0.0.1:59042
- Signing Key: urn:proto:wsap:signing:wsap-20251016234335
- Signature policy: registry/signature-policy.json

Registered Agents:
- urn:agent:wsap:analytics@1.0.0 ⇒ analytics.report, analytics.echo
- urn:agent:wsap:workflow@1.0.0 ⇒ workflow.approval, workflow.echo
- urn:agent:wsap:monitor@1.0.0 ⇒ monitor.health, monitor.echo

## A2A Calls

- urn:urn:agent:wsap:analytics@1.0.0 → urn:agent:wsap:analytics@1.0.0 (6ms)
- capability:analytics.report → urn:agent:wsap:analytics@1.0.0 (4ms)
- urn:urn:agent:wsap:workflow@1.0.0 → urn:agent:wsap:workflow@1.0.0 (3ms)
- capability:workflow.approval → urn:agent:wsap:workflow@1.0.0 (4ms)
- urn:urn:agent:wsap:monitor@1.0.0 → urn:agent:wsap:monitor@1.0.0 (2ms)
- capability:monitor.health → urn:agent:wsap:monitor@1.0.0 (2ms)

## Artifact Signatures

- report.json: report.json.sig.json (valid)
- diagram.drawio: drawio/catalog.drawio.sig.json (valid)
