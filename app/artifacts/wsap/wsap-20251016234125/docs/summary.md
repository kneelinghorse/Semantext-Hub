# WSAP Session wsap-20251016234125

- Started: 2025-10-16T23:41:25.213Z
- Completed: 2025-10-16T23:41:25.378Z
- Seed: github-api
- Draft manifest: drafts/api-manifest.draft.json
- Approved manifest: approved/api-manifest.approved.json
- Catalog graph: catalog/catalog-graph.json
- Draw.io diagram: drawio/catalog.drawio
- Cytoscape export: cytoscape/catalog.json
- Metrics log: ../../../../artifacts/perf/2025-10-16/wsap-20251016234125.jsonl

## Durations (ms)

- import: 33.912
- approve: 10.323
- catalog: 6.172
- diagram: 9.042
- cytoscape: 3.682
- docs: 0.116
- registry: 62.814
- a2a: 23.587
- report: 0.454
- sign: 3.288
- open: 0.055

## Aggregated Metrics
- ingest: 44.235ms (ok=true)
- plan: 22.809ms (ok=true)
- runtime: 86.401ms (ok=true)

## Performance Budgets: PASS

## Multi-Agent Registry

- Registry URL: http://127.0.0.1:58855
- Signing Key: urn:proto:wsap:signing:wsap-20251016234125
- Signature policy: registry/signature-policy.json

Registered Agents:
- urn:agent:wsap:analytics@1.0.0 ⇒ analytics.report, analytics.echo
- urn:agent:wsap:workflow@1.0.0 ⇒ workflow.approval, workflow.echo
- urn:agent:wsap:monitor@1.0.0 ⇒ monitor.health, monitor.echo

## A2A Calls

- urn:urn:agent:wsap:analytics@1.0.0 → urn:agent:wsap:analytics@1.0.0 (7ms)
- capability:analytics.report → urn:agent:wsap:analytics@1.0.0 (5ms)
- urn:urn:agent:wsap:workflow@1.0.0 → urn:agent:wsap:workflow@1.0.0 (2ms)
- capability:workflow.approval → urn:agent:wsap:workflow@1.0.0 (3ms)
- urn:urn:agent:wsap:monitor@1.0.0 → urn:agent:wsap:monitor@1.0.0 (2ms)
- capability:monitor.health → urn:agent:wsap:monitor@1.0.0 (2ms)

## Artifact Signatures

- report.json: report.json.sig.json (valid)
- diagram.drawio: drawio/catalog.drawio.sig.json (valid)
