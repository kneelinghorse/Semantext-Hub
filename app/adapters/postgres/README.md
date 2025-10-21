# Postgres DDL Reference Adapter

Generated on 2025-10-18T00:03:04.946Z with `ossp init adapter`.

## Overview
- Adapter type: Data
- URN: `urn:adapter:data:postgres@0.1.0`
- Spec checksum: `21e9a9ae83485601f076d36af91cf24670c7801c6b01ede727034333a1f398db`

Reference Postgres DDL adapter for OSSP Pack v1

## Capabilities
- `adapter.data.discover` — Implements database entities workflows.
- `adapter.data.extract` — Implements database entities workflows.

## Quick start
```bash
npm install
npm test
npm run build -- --spec ./fixtures/minimal.json --out ../../artifacts/adapters/postgres
```

## Project layout
- `src/index.mjs` — Normalizes Data specs into catalog fragments.
- `src/schema.map.json` — Mapping hints for translating source fields to OSSP catalog.
- `tests/adapter.spec.mjs` — Node test that exercises `buildAdapter`.
- `agent.card.json` — Registry-ready Agent Card with declared capabilities.
- `fixtures/` — Local copy of the source spec for reproducible builds.

## Next steps
- Replace sampling logic inside `src/index.mjs` with data specific to your Data source.
- Expand `src/schema.map.json` with the real field mappings.
- Update `agent.card.json` with live endpoints, signing details, and metadata.
- Wire the adapter into WSAP or the registry by running `npm run build` and publishing the generated catalog artifact.
