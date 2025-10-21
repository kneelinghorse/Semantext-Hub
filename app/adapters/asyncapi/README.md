# AsyncAPI Reference Adapter

Generated on 2025-10-18T00:03:04.846Z with `ossp init adapter`.

## Overview
- Adapter type: Event
- URN: `urn:adapter:event:asyncapi@0.1.0`
- Spec checksum: `512fbd6aea623abbfe470084ba4198ee5983ce34a8312f89e45e4c718767bc7f`

Reference AsyncAPI adapter for OSSP Pack v1

## Capabilities
- `adapter.event.discover` — Implements event streams workflows.
- `adapter.event.normalize` — Implements event streams workflows.

## Quick start
```bash
npm install
npm test
npm run build -- --spec ./fixtures/minimal.json --out ../../artifacts/adapters/asyncapi
```

## Project layout
- `src/index.mjs` — Normalizes Event specs into catalog fragments.
- `src/schema.map.json` — Mapping hints for translating source fields to OSSP catalog.
- `tests/adapter.spec.mjs` — Node test that exercises `buildAdapter`.
- `agent.card.json` — Registry-ready Agent Card with declared capabilities.
- `fixtures/` — Local copy of the source spec for reproducible builds.

## Next steps
- Replace sampling logic inside `src/index.mjs` with data specific to your Event source.
- Expand `src/schema.map.json` with the real field mappings.
- Update `agent.card.json` with live endpoints, signing details, and metadata.
- Wire the adapter into WSAP or the registry by running `npm run build` and publishing the generated catalog artifact.
