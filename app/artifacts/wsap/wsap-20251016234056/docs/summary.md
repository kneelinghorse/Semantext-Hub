# WSAP Session wsap-20251016234056

- Started: 2025-10-16T23:40:56.164Z
- Completed: 2025-10-16T23:40:56.278Z
- Seed: github-api
- Draft manifest: drafts/api-manifest.draft.json
- Approved manifest: approved/api-manifest.approved.json
- Catalog graph: catalog/catalog-graph.json
- Draw.io diagram: drawio/catalog.drawio
- Cytoscape export: cytoscape/catalog.json
- Metrics log: ../../../../artifacts/perf/2025-10-16/wsap-20251016234056.jsonl

## Durations (ms)

- import: 23.891
- approve: 6.3
- catalog: 4.276
- diagram: 7.243
- cytoscape: 2.374
- docs: 0.026
- registry: 40.908
- a2a: 17.996
- report: 0.397
- sign: 1.146
- open: 0.034

## Aggregated Metrics
- ingest: 30.191ms (ok=true)
- plan: 15.496ms (ok=true)
- runtime: 58.904ms (ok=true)

## Performance Budgets: PASS

## Multi-Agent Registry

- Registry URL: http://127.0.0.1:58824
- Signing Key: urn:proto:wsap:signing:wsap-20251016234056
- Signature policy: registry/signature-policy.json

Registered Agents:
- urn:agent:wsap:analytics@1.0.0 ⇒ analytics.report, analytics.echo
- urn:agent:wsap:workflow@1.0.0 ⇒ workflow.approval, workflow.echo
- urn:agent:wsap:monitor@1.0.0 ⇒ monitor.health, monitor.echo

## A2A Calls

- urn:urn:agent:wsap:analytics@1.0.0 → urn:agent:wsap:analytics@1.0.0 (5ms)
- capability:analytics.report → urn:agent:wsap:analytics@1.0.0 (3ms)
- urn:urn:agent:wsap:workflow@1.0.0 → urn:agent:wsap:workflow@1.0.0 (3ms)
- capability:workflow.approval → urn:agent:wsap:workflow@1.0.0 (3ms)
- urn:urn:agent:wsap:monitor@1.0.0 → urn:agent:wsap:monitor@1.0.0 (2ms)
- capability:monitor.health → urn:agent:wsap:monitor@1.0.0 (2ms)

## Artifact Signatures

- report.json: report.json.sig.json (valid)
- diagram.drawio: drawio/catalog.drawio.sig.json (valid)
