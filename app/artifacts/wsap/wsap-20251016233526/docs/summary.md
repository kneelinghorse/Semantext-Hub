# WSAP Session wsap-20251016233526

- Started: 2025-10-16T23:35:26.564Z
- Completed: 2025-10-16T23:35:26.705Z
- Seed: github-api
- Draft manifest: drafts/api-manifest.draft.json
- Approved manifest: approved/api-manifest.approved.json
- Catalog graph: catalog/catalog-graph.json
- Draw.io diagram: drawio/catalog.drawio
- Cytoscape export: cytoscape/catalog.json
- Metrics log: ../../../../artifacts/perf/2025-10-16/wsap-20251016233526.jsonl

## Durations (ms)

- import: 32.276
- approve: 12.656
- catalog: 4.08
- diagram: 10.443
- cytoscape: 1.567
- docs: 0.022
- registry: 51.645
- a2a: 18.049
- report: 0.405
- sign: 1.289
- open: 0.035

## Aggregated Metrics
- ingest: 44.932ms (ok=true)
- plan: 17.841ms (ok=true)
- runtime: 69.694ms (ok=true)

## Performance Budgets: PASS

## Multi-Agent Registry

- Registry URL: http://127.0.0.1:58612
- Signing Key: urn:proto:wsap:signing:wsap-20251016233526
- Signature policy: registry/signature-policy.json

Registered Agents:
- urn:agent:wsap:analytics@1.0.0 ⇒ analytics.report, analytics.echo
- urn:agent:wsap:workflow@1.0.0 ⇒ workflow.approval, workflow.echo
- urn:agent:wsap:monitor@1.0.0 ⇒ monitor.health, monitor.echo

## A2A Calls

- urn:urn:agent:wsap:analytics@1.0.0 → urn:agent:wsap:analytics@1.0.0 (4ms)
- capability:analytics.report → urn:agent:wsap:analytics@1.0.0 (4ms)
- urn:urn:agent:wsap:workflow@1.0.0 → urn:agent:wsap:workflow@1.0.0 (3ms)
- capability:workflow.approval → urn:agent:wsap:workflow@1.0.0 (2ms)
- urn:urn:agent:wsap:monitor@1.0.0 → urn:agent:wsap:monitor@1.0.0 (2ms)
- capability:monitor.health → urn:agent:wsap:monitor@1.0.0 (2ms)

## Artifact Signatures

- report.json: report.json.sig.json (valid)
- diagram.drawio: drawio/catalog.drawio.sig.json (valid)
