# WSAP Session wsap-20251016235003

- Started: 2025-10-16T23:50:03.969Z
- Completed: 2025-10-16T23:50:04.081Z
- Seed: github-api
- Draft manifest: drafts/api-manifest.draft.json
- Approved manifest: approved/api-manifest.approved.json
- Catalog graph: catalog/catalog-graph.json
- Draw.io diagram: drawio/catalog.drawio
- Cytoscape export: cytoscape/catalog.json
- Metrics log: ../../../../artifacts/perf/2025-10-16/wsap-20251016235003.jsonl

## Durations (ms)

- import: 23.928
- approve: 7.611
- catalog: 2.359
- diagram: 7.326
- cytoscape: 1.37
- docs: 0.02
- registry: 37.389
- a2a: 21.206
- report: 0.46
- sign: 1.732
- open: 0.052

## Aggregated Metrics
- ingest: 31.539ms (ok=true)
- plan: 13.319ms (ok=true)
- runtime: 58.595ms (ok=true)

## Performance Budgets: PASS

## Multi-Agent Registry

- Registry URL: http://127.0.0.1:59441
- Signing Key: urn:proto:wsap:signing:wsap-20251016235003
- Signature policy: registry/signature-policy.json

Registered Agents:
- urn:agent:wsap:analytics@1.0.0 ⇒ analytics.report, analytics.echo
- urn:agent:wsap:workflow@1.0.0 ⇒ workflow.approval, workflow.echo
- urn:agent:wsap:monitor@1.0.0 ⇒ monitor.health, monitor.echo

## A2A Calls

- urn:urn:agent:wsap:analytics@1.0.0 → urn:agent:wsap:analytics@1.0.0 (4ms)
- capability:analytics.report → urn:agent:wsap:analytics@1.0.0 (3ms)
- urn:urn:agent:wsap:workflow@1.0.0 → urn:agent:wsap:workflow@1.0.0 (5ms)
- capability:workflow.approval → urn:agent:wsap:workflow@1.0.0 (2ms)
- urn:urn:agent:wsap:monitor@1.0.0 → urn:agent:wsap:monitor@1.0.0 (2ms)
- capability:monitor.health → urn:agent:wsap:monitor@1.0.0 (2ms)

## Artifact Signatures

- report.json: report.json.sig.json (valid)
- diagram.drawio: drawio/catalog.drawio.sig.json (valid)
