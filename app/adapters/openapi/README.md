# OpenAPI Reference Adapter

Generated on 2025-10-18T00:03:04.710Z with `ossp init adapter`.

## Overview
- Adapter type: API
- URN: `urn:adapter:api:openapi@0.1.0`
- Spec checksum: `8a02e7cafb321516bce716bd2825c084063c3f280472ca85f38c260f830d13dd`

Reference OpenAPI adapter for OSSP Pack v1

## Capabilities
- `adapter.api.discover` — Implements HTTP endpoints workflows.
- `adapter.api.normalize` — Implements HTTP endpoints workflows.

## Quick start
```bash
npm install
npm test
npm run build -- --spec ./fixtures/spec.json --out ../../artifacts/adapters/openapi
```

## Project layout
- `src/index.mjs` — Normalizes API specs into catalog fragments.
- `src/schema.map.json` — Mapping hints for translating source fields to OSSP catalog.
- `tests/adapter.spec.mjs` — Node test that exercises `buildAdapter`.
- `agent.card.json` — Registry-ready Agent Card with declared capabilities.
- `fixtures/` — Local copy of the source spec for reproducible builds.

## Next steps
- Replace sampling logic inside `src/index.mjs` with data specific to your API source.
- Expand `src/schema.map.json` with the real field mappings.
- Update `agent.card.json` with live endpoints, signing details, and metadata.
- Wire the adapter into WSAP or the registry by running `npm run build` and publishing the generated catalog artifact.
