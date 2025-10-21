# WSAP Session wsap-20251020215530

- Started: 2025-10-20T21:55:30.614Z
- Completed: 2025-10-20T21:55:30.790Z
- Seed: github-api
- Draft manifest: drafts/api-manifest.draft.json
- Approved manifest: approved/api-manifest.approved.json
- Catalog graph: catalog/catalog-graph.json
- Draw.io diagram: drawio/catalog.drawio
- Cytoscape export: cytoscape/catalog.json
- Metrics log: metrics/2025-10-20/wsap-20251020215530.jsonl

## Durations (ms)

- import: 50.751
- approve: 7.254
- catalog: 2.946
- diagram: 8.567
- cytoscape: 1.383
- docs: 0.018
- registry: 64.81
- a2a: 27.991
- report: 0.618
- sign: 1.264
- open: 0.18

## Aggregated Metrics
- ingest: 58.005ms (ok=true)
- plan: 14.976ms (ok=true)
- runtime: 92.801ms (ok=true)

## Performance Budgets: FAIL
  - wsap/import avg: 50.75ms > 40.00ms

## Multi-Agent Registry

- Registry URL: http://127.0.0.1:63117
- Signing Key: urn:proto:wsap:signing:wsap-20251020215530
- Signature policy: registry/signature-policy.json

Registered Agents:
- urn:agent:wsap:analytics@1.0.0 ⇒ analytics.report, analytics.echo
- urn:agent:wsap:workflow@1.0.0 ⇒ workflow.approval, workflow.echo
- urn:agent:wsap:monitor@1.0.0 ⇒ monitor.health, monitor.echo

## A2A Calls

- urn:urn:agent:wsap:analytics@1.0.0 → urn:agent:wsap:analytics@1.0.0 (7ms)
- capability:analytics.report → urn:agent:wsap:analytics@1.0.0 (4ms)
- urn:urn:agent:wsap:workflow@1.0.0 → urn:agent:wsap:workflow@1.0.0 (3ms)
- capability:workflow.approval → urn:agent:wsap:workflow@1.0.0 (3ms)
- urn:urn:agent:wsap:monitor@1.0.0 → urn:agent:wsap:monitor@1.0.0 (4ms)
- capability:monitor.health → urn:agent:wsap:monitor@1.0.0 (3ms)

## Artifact Signatures

- report.json: report.json.sig.json (valid)
- diagram.drawio: drawio/catalog.drawio.sig.json (valid)

## Errors

- wsap/import exceeded avg (50.75ms > 40.00ms)
