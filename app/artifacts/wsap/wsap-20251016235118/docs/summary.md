# WSAP Session wsap-20251016235118

- Started: 2025-10-16T23:51:18.801Z
- Completed: 2025-10-16T23:51:18.898Z
- Seed: github-api
- Draft manifest: drafts/api-manifest.draft.json
- Approved manifest: approved/api-manifest.approved.json
- Catalog graph: catalog/catalog-graph.json
- Draw.io diagram: drawio/catalog.drawio
- Cytoscape export: cytoscape/catalog.json
- Metrics log: ../../../../artifacts/perf/2025-10-16/wsap-20251016235118.jsonl

## Durations (ms)

- import: 22.716
- approve: 5.303
- catalog: 1.95
- diagram: 6.269
- cytoscape: 1.895
- docs: 0.021
- registry: 33.398
- a2a: 16.739
- report: 0.636
- sign: 1.578
- open: 0.036

## Aggregated Metrics
- ingest: 28.019ms (ok=true)
- plan: 12.385ms (ok=true)
- runtime: 50.137ms (ok=true)

## Performance Budgets: PASS

## Multi-Agent Registry

- Registry URL: http://127.0.0.1:59549
- Signing Key: urn:proto:wsap:signing:wsap-20251016235118
- Signature policy: registry/signature-policy.json

Registered Agents:
- urn:agent:wsap:analytics@1.0.0 ⇒ analytics.report, analytics.echo
- urn:agent:wsap:workflow@1.0.0 ⇒ workflow.approval, workflow.echo
- urn:agent:wsap:monitor@1.0.0 ⇒ monitor.health, monitor.echo

## A2A Calls

- urn:urn:agent:wsap:analytics@1.0.0 → urn:agent:wsap:analytics@1.0.0 (4ms)
- capability:analytics.report → urn:agent:wsap:analytics@1.0.0 (2ms)
- urn:urn:agent:wsap:workflow@1.0.0 → urn:agent:wsap:workflow@1.0.0 (2ms)
- capability:workflow.approval → urn:agent:wsap:workflow@1.0.0 (2ms)
- urn:urn:agent:wsap:monitor@1.0.0 → urn:agent:wsap:monitor@1.0.0 (2ms)
- capability:monitor.health → urn:agent:wsap:monitor@1.0.0 (2ms)

## Artifact Signatures

- report.json: report.json.sig.json (valid)
- diagram.drawio: drawio/catalog.drawio.sig.json (valid)
