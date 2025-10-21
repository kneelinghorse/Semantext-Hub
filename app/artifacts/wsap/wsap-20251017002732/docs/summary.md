# WSAP Session wsap-20251017002732

- Started: 2025-10-17T00:27:32.756Z
- Completed: 2025-10-17T00:27:32.858Z
- Seed: github-api
- Draft manifest: drafts/api-manifest.draft.json
- Approved manifest: approved/api-manifest.approved.json
- Catalog graph: catalog/catalog-graph.json
- Draw.io diagram: drawio/catalog.drawio
- Cytoscape export: cytoscape/catalog.json
- Metrics log: ../../../../artifacts/perf/2025-10-17/wsap-20251017002732.jsonl

## Durations (ms)

- import: 23.692
- approve: 7.861
- catalog: 2.27
- diagram: 7.152
- cytoscape: 1.37
- docs: 0.024
- registry: 35.772
- a2a: 16.125
- report: 0.401
- sign: 1.17
- open: 0.029

## Aggregated Metrics
- ingest: 31.553ms (ok=true)
- plan: 12.416ms (ok=true)
- runtime: 51.897ms (ok=true)

## Performance Budgets: PASS

## Multi-Agent Registry

- Registry URL: http://127.0.0.1:60698
- Signing Key: urn:proto:wsap:signing:wsap-20251017002732
- Signature policy: registry/signature-policy.json

Registered Agents:
- urn:agent:wsap:analytics@1.0.0 ⇒ analytics.report, analytics.echo
- urn:agent:wsap:workflow@1.0.0 ⇒ workflow.approval, workflow.echo
- urn:agent:wsap:monitor@1.0.0 ⇒ monitor.health, monitor.echo

## A2A Calls

- urn:urn:agent:wsap:analytics@1.0.0 → urn:agent:wsap:analytics@1.0.0 (3ms)
- capability:analytics.report → urn:agent:wsap:analytics@1.0.0 (2ms)
- urn:urn:agent:wsap:workflow@1.0.0 → urn:agent:wsap:workflow@1.0.0 (2ms)
- capability:workflow.approval → urn:agent:wsap:workflow@1.0.0 (3ms)
- urn:urn:agent:wsap:monitor@1.0.0 → urn:agent:wsap:monitor@1.0.0 (2ms)
- capability:monitor.health → urn:agent:wsap:monitor@1.0.0 (2ms)

## Artifact Signatures

- report.json: report.json.sig.json (valid)
- diagram.drawio: drawio/catalog.drawio.sig.json (valid)
