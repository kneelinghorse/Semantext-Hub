# Governance Surface Overview

The Sprint 23 governance mission wires real data into the protocol viewer so teams can inspect ownership, classification, and policy signals without leaving the curated demo workspace.

## Data Pipeline

1. Run `node scripts/demo/run-showcase.mjs --overwrite` to copy curated manifests into `artifacts/catalogs/showcase/`.
2. The viewer API walks `artifacts/`, `artifacts/catalogs/`, and `artifacts/manifests/` for JSON manifests containing URNs and governance metadata.
3. For each manifest the route derives:
   - protocol `name`, `kind`, and `status`
   - inferred owner (from manifest metadata or namespace)
   - governance `classification`, `visibility`, and PII flags
   - tag and source provenance
4. Summary metrics track counts per kind, status, classification, owners, PII exposure, and missing metadata.

## API Endpoint

```
GET /api/governance
```

Response (abridged):

```json
{
  "generated_at": "2025-10-27T14:08:00Z",
  "summary": {
    "total": 3,
    "withOwner": 3,
    "missingOwner": 0,
    "pii": 0,
    "byKind": { "api": 1, "event": 1, "workflow": 1 },
    "byClassification": { "internal": 3 },
    "byStatus": { "approved": 3 },
    "owners": { "demo.showcase": 3 },
    "alerts": []
  },
  "manifests": [
    {
      "urn": "urn:proto:api:demo.showcase/order-api@v1.0.0",
      "name": "Demo Order Service API",
      "kind": "api",
      "owner": "demo.showcase",
      "classification": "internal",
      "status": "approved",
      "pii": false,
      "tags": ["demo", "showcase"],
      "source": "openapi",
      "path": "catalogs/showcase/order-api.json"
    }
  ],
  "artifacts": {
    "scanned": 3,
    "root": "/path/to/workspace/artifacts"
  }
}
```

When no manifests are found the API returns `404` with guidance to rerun the showcase script.

## Viewer Experience

- A new **Governance** tab appears alongside Health, Manifests, Validation, and Graph.
- The tab renders:
  - summary metrics (protocol count, owners, PII flags)
  - breakdowns by kind, classification, status, and owner
  - alerts for missing governance metadata
  - a sortable table of manifest details
- All semantic telemetry is wired so downstream analytics can observe governance usage.

## Troubleshooting

- **404 from API / blank tab:** run `node scripts/demo/run-showcase.mjs --overwrite` to generate manifests or copy real manifests into `artifacts/manifests/`.
- **Missing owners:** add `metadata.governance.owner` or `metadata.owner` to the manifest. Otherwise the namespace segment in the URN is used.
- **False PII flags:** ensure manifests set `metadata.governance.policy.classification` to a non-PII value or remove `"pii"` tags if not required.
