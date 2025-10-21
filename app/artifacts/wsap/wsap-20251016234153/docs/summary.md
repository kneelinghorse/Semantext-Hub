# WSAP Session wsap-20251016234153

- Started: 2025-10-16T23:41:53.196Z
- Completed: 2025-10-16T23:41:53.347Z
- Seed: github-api
- Draft manifest: drafts/api-manifest.draft.json
- Approved manifest: approved/api-manifest.approved.json
- Catalog graph: catalog/catalog-graph.json
- Draw.io diagram: drawio/catalog.drawio
- Cytoscape export: cytoscape/catalog.json
- Metrics log: ../../../../artifacts/perf/2025-10-16/wsap-20251016234153.jsonl

## Durations (ms)

- import: 23.947
- approve: 7.215
- catalog: 2.483
- diagram: 8.36
- cytoscape: 1.366
- docs: 0.017
- registry: 38.691
- a2a: 55.634
- report: 2.132
- sign: 2.549
- open: 0.065

## Aggregated Metrics
- ingest: 31.162ms (ok=true)
- plan: 16.972ms (ok=true)
- runtime: 94.325ms (ok=true)

## Performance Budgets: PASS

## Multi-Agent Registry

- Registry URL: http://127.0.0.1:58927
- Signing Key: urn:proto:wsap:signing:wsap-20251016234153
- Signature policy: registry/signature-policy.json

Registered Agents:
- urn:agent:wsap:analytics@1.0.0 ⇒ analytics.report, analytics.echo
- urn:agent:wsap:workflow@1.0.0 ⇒ workflow.approval, workflow.echo
- urn:agent:wsap:monitor@1.0.0 ⇒ monitor.health, monitor.echo

## A2A Calls

- urn:urn:agent:wsap:analytics@1.0.0 → urn:agent:wsap:analytics@1.0.0 (3ms)
- capability:analytics.report → urn:agent:wsap:analytics@1.0.0 (3ms)
- urn:urn:agent:wsap:workflow@1.0.0 → urn:agent:wsap:workflow@1.0.0 (2ms)
- capability:workflow.approval → urn:agent:wsap:workflow@1.0.0 (5ms)
- urn:urn:agent:wsap:monitor@1.0.0 → urn:agent:wsap:monitor@1.0.0 (28ms)
- capability:monitor.health → urn:agent:wsap:monitor@1.0.0 (4ms)

## Artifact Signatures

- report.json: report.json.sig.json (valid)
- diagram.drawio: drawio/catalog.drawio.sig.json (valid)
