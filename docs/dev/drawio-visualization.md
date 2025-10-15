# Draw.io Visualization Pipeline

> Mission M13.1 – Draw.io Exporter

This guide explains how to transform the canonical catalog graph into a native Draw.io (`.drawio`) diagram using the OSSP CLI tooling added in Sprint 13.

## Command Overview

- Entry point: `app/cli/commands/catalog-generate-diagram.ts`
- Default input: `./artifacts/catalog-graph.json` (canonical node/edge payload)
- Default output: `./artifacts/diagrams/catalog-<timestamp>.drawio`

```bash
node app/cli/commands/catalog-generate-diagram.ts \
  --input ./artifacts/catalog-graph.json \
  --output ./artifacts/diagrams/catalog-latest.drawio \
  --overwrite
```

### Flags

- `--input, -i` – Canonical graph JSON path (defaults to `artifacts/catalog-graph.json`)
- `--output, -o` – Target `.drawio` file path (defaults to timestamped name under `artifacts/diagrams/`)
- `--workspace, -w` – Workspace root (defaults to current working directory)
- `--overwrite` – Replace the target file if it already exists
- `--silent` – Suppress console output (useful for scripting/tests)

## Canonical Graph Schema

The exporter expects a JSON structure with `nodes` and `edges` collections:

```json
{
  "id": "catalog-graph",
  "name": "Protocol Catalog",
  "nodes": [
    {
      "id": "urn:protocol:catalog-api",
      "label": "Catalog API",
      "type": "protocol",
      "domain": "core"
    }
  ],
  "edges": [
    {
      "source": "urn:protocol:catalog-api",
      "target": "urn:service:inventory",
      "type": "depends_on"
    }
  ]
}
```

Runtime validation (Ajv) guards against malformed payloads before diagram generation.

## Style System

- Theme schema: `app/config/theme-style-schema.json`
- Theme definitions: `app/config/themes/*.json` (palettes + Draw.io/Cytoscape sections)
- Runtime resolver: `app/src/visualization/theme/serializer.ts` merges defaults, node type overrides, and domain palettes
- Apply themes via `app-cli theme switch <name>`; missing type/domain entries still export but emit warnings

## Developer Notes

- The exporter (`app/src/visualization/drawio/exporter.ts`) returns the Draw.io XML string and warnings
- `writeDrawio(...)` persists diagrams and ensures the `artifacts/diagrams/` directory exists
- Tests cover serialization (`exporter.test.ts`) and command smoke behaviour (`smoke.test.ts`)
- Artifacts are designed to open directly in [https://app.diagrams.net](https://app.diagrams.net)
