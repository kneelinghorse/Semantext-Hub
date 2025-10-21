# WSAP Session wsap-20251016234944

- Started: 2025-10-16T23:49:44.219Z
- Completed: 2025-10-16T23:49:44.334Z
- Seed: github-api
- Draft manifest: drafts/api-manifest.draft.json
- Approved manifest: approved/api-manifest.approved.json
- Catalog graph: catalog/catalog-graph.json
- Draw.io diagram: drawio/catalog.drawio
- Cytoscape export: cytoscape/catalog.json
- Metrics log: ../../../../artifacts/perf/2025-10-16/wsap-20251016234944.jsonl

## Durations (ms)

- import: 23.709
- approve: 7.281
- catalog: 3.952
- diagram: 8.088
- cytoscape: 1.435
- docs: 0.023
- registry: 37.99
- a2a: 20.948
- report: 0.935
- sign: 1.949
- open: 0.054

## Aggregated Metrics
- ingest: 30.99ms (ok=true)
- plan: 16.436ms (ok=true)
- runtime: 58.938ms (ok=true)

## Performance Budgets: PASS

## Multi-Agent Registry

- Registry URL: http://127.0.0.1:59386
- Signing Key: urn:proto:wsap:signing:wsap-20251016234944
- Signature policy: registry/signature-policy.json

Registered Agents:
- urn:agent:wsap:analytics@1.0.0 ⇒ analytics.report, analytics.echo
- urn:agent:wsap:workflow@1.0.0 ⇒ workflow.approval, workflow.echo
- urn:agent:wsap:monitor@1.0.0 ⇒ monitor.health, monitor.echo

## A2A Calls

- urn:urn:agent:wsap:analytics@1.0.0 → urn:agent:wsap:analytics@1.0.0 (3ms)
- capability:analytics.report → urn:agent:wsap:analytics@1.0.0 (3ms)
- urn:urn:agent:wsap:workflow@1.0.0 → urn:agent:wsap:workflow@1.0.0 (2ms)
- capability:workflow.approval → urn:agent:wsap:workflow@1.0.0 (2ms)
- urn:urn:agent:wsap:monitor@1.0.0 → urn:agent:wsap:monitor@1.0.0 (4ms)
- capability:monitor.health → urn:agent:wsap:monitor@1.0.0 (2ms)

## Artifact Signatures

- report.json: report.json.sig.json (valid)
- diagram.drawio: drawio/catalog.drawio.sig.json (valid)
