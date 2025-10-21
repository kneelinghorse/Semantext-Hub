# __ADAPTER_DISPLAY_NAME__ Adapter

Generated on __GENERATED_AT__ with `ossp init adapter`.

## Overview
- Adapter type: __TYPE_TITLE__
- URN: `__URN__`
- Spec checksum: `__CHECKSUM__`

__ADAPTER_DESCRIPTION__

## Capabilities
__CAPABILITIES_LIST__

## Quick start
```bash
npm install
npm test
npm run build -- --spec __SPEC_RELATIVE_PATH__ --out __OUTPUT_RELATIVE_PATH__
```

## Project layout
- `src/index.mjs` — Normalizes __TYPE_TITLE__ specs into catalog fragments.
- `src/schema.map.json` — Mapping hints for translating source fields to OSSP catalog.
- `tests/adapter.spec.mjs` — Node test that exercises `buildAdapter`.
- `agent.card.json` — Registry-ready Agent Card with declared capabilities.
- `fixtures/` — Local copy of the source spec for reproducible builds.

## Next steps
- Replace sampling logic inside `src/index.mjs` with data specific to your __TYPE_TITLE__ source.
- Expand `src/schema.map.json` with the real field mappings.
- Update `agent.card.json` with live endpoints, signing details, and metadata.
- Wire the adapter into WSAP or the registry by running `npm run build` and publishing the generated catalog artifact.
