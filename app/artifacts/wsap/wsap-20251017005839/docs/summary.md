# WSAP Session wsap-20251017005839

- Started: 2025-10-17T00:58:39.904Z
- Completed: 2025-10-17T00:58:40.009Z
- Seed: github-api
- Draft manifest: drafts/api-manifest.draft.json
- Approved manifest: approved/api-manifest.approved.json
- Catalog graph: catalog/catalog-graph.json
- Draw.io diagram: drawio/catalog.drawio
- Cytoscape export: cytoscape/catalog.json
- Metrics log: ../../../../artifacts/perf/2025-10-17/wsap-20251017005839.jsonl

## Durations (ms)

- import: 24.574
- approve: 8.52
- catalog: 5.872
- diagram: 7.367
- cytoscape: 1.228
- docs: 0.018
- registry: 34.133
- a2a: 15.59
- report: 0.36
- sign: 1.243
- open: 0.031

## Aggregated Metrics
- ingest: 33.094ms (ok=true)
- plan: 16.119ms (ok=true)
- runtime: 49.723ms (ok=true)

## Performance Budgets: PASS

## Multi-Agent Registry

- Registry URL: http://127.0.0.1:61957
- Signing Key: urn:proto:wsap:signing:wsap-20251017005839
- Signature policy: registry/signature-policy.json

Registered Agents:
- urn:agent:wsap:analytics@1.0.0 ⇒ analytics.report, analytics.echo
- urn:agent:wsap:workflow@1.0.0 ⇒ workflow.approval, workflow.echo
- urn:agent:wsap:monitor@1.0.0 ⇒ monitor.health, monitor.echo

## A2A Calls

- urn:urn:agent:wsap:analytics@1.0.0 → urn:agent:wsap:analytics@1.0.0 (3ms)
- capability:analytics.report → urn:agent:wsap:analytics@1.0.0 (3ms)
- urn:urn:agent:wsap:workflow@1.0.0 → urn:agent:wsap:workflow@1.0.0 (3ms)
- capability:workflow.approval → urn:agent:wsap:workflow@1.0.0 (2ms)
- urn:urn:agent:wsap:monitor@1.0.0 → urn:agent:wsap:monitor@1.0.0 (1ms)
- capability:monitor.health → urn:agent:wsap:monitor@1.0.0 (1ms)

## Artifact Signatures

- report.json: report.json.sig.json (valid)
- diagram.drawio: drawio/catalog.drawio.sig.json (valid)
