# WSAP Session wsap-20251017002703

- Started: 2025-10-17T00:27:03.616Z
- Completed: 2025-10-17T00:27:03.749Z
- Seed: github-api
- Draft manifest: drafts/api-manifest.draft.json
- Approved manifest: approved/api-manifest.approved.json
- Catalog graph: catalog/catalog-graph.json
- Draw.io diagram: drawio/catalog.drawio
- Cytoscape export: cytoscape/catalog.json
- Metrics log: ../../../../artifacts/perf/2025-10-17/wsap-20251017002703.jsonl

## Durations (ms)

- import: 37.543
- approve: 10.696
- catalog: 3.791
- diagram: 8.626
- cytoscape: 1.926
- docs: 0.02
- registry: 39.906
- a2a: 19.717
- report: 0.436
- sign: 1.421
- open: 0.028

## Aggregated Metrics
- ingest: 48.239ms (ok=true)
- plan: 16.248ms (ok=true)
- runtime: 59.623ms (ok=true)

## Performance Budgets: PASS

## Multi-Agent Registry

- Registry URL: http://127.0.0.1:60640
- Signing Key: urn:proto:wsap:signing:wsap-20251017002703
- Signature policy: registry/signature-policy.json

Registered Agents:
- urn:agent:wsap:analytics@1.0.0 ⇒ analytics.report, analytics.echo
- urn:agent:wsap:workflow@1.0.0 ⇒ workflow.approval, workflow.echo
- urn:agent:wsap:monitor@1.0.0 ⇒ monitor.health, monitor.echo

## A2A Calls

- urn:urn:agent:wsap:analytics@1.0.0 → urn:agent:wsap:analytics@1.0.0 (4ms)
- capability:analytics.report → urn:agent:wsap:analytics@1.0.0 (3ms)
- urn:urn:agent:wsap:workflow@1.0.0 → urn:agent:wsap:workflow@1.0.0 (2ms)
- capability:workflow.approval → urn:agent:wsap:workflow@1.0.0 (2ms)
- urn:urn:agent:wsap:monitor@1.0.0 → urn:agent:wsap:monitor@1.0.0 (1ms)
- capability:monitor.health → urn:agent:wsap:monitor@1.0.0 (3ms)

## Artifact Signatures

- report.json: report.json.sig.json (valid)
- diagram.drawio: drawio/catalog.drawio.sig.json (valid)
