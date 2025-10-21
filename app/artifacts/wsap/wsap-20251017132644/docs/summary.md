# WSAP Session wsap-20251017132644

- Started: 2025-10-17T13:26:44.704Z
- Completed: 2025-10-17T13:26:44.814Z
- Seed: github-api
- Draft manifest: drafts/api-manifest.draft.json
- Approved manifest: approved/api-manifest.approved.json
- Catalog graph: catalog/catalog-graph.json
- Draw.io diagram: drawio/catalog.drawio
- Cytoscape export: cytoscape/catalog.json
- Metrics log: ../../../../artifacts/perf/2025-10-17/wsap-20251017132644.jsonl

## Durations (ms)

- import: 37.23
- approve: 5.026
- catalog: 1.955
- diagram: 6.78
- cytoscape: 1.416
- docs: 0.165
- registry: 33.649
- a2a: 15.179
- report: 0.391
- sign: 1.209
- open: 0.03

## Aggregated Metrics
- ingest: 42.256ms (ok=true)
- plan: 11.946ms (ok=true)
- runtime: 48.828ms (ok=true)

## Performance Budgets: PASS

## Multi-Agent Registry

- Registry URL: http://127.0.0.1:57565
- Signing Key: urn:proto:wsap:signing:wsap-20251017132644
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
- urn:urn:agent:wsap:monitor@1.0.0 → urn:agent:wsap:monitor@1.0.0 (2ms)
- capability:monitor.health → urn:agent:wsap:monitor@1.0.0 (2ms)

## Artifact Signatures

- report.json: report.json.sig.json (valid)
- diagram.drawio: drawio/catalog.drawio.sig.json (valid)
