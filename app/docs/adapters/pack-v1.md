# Adapter Pack v1

This pack includes three minimal, version-pinned reference adapters to demonstrate end-to-end workflows:

- OpenAPI adapter (`app/adapters/openapi`)
- AsyncAPI adapter (`app/adapters/asyncapi`)
- Postgres DDL adapter (`app/adapters/postgres`)

Each adapter includes:
- Local `fixtures/` with a pinned spec copy
- `agent.card.json` with declared capabilities
- `src/index.mjs` with a `buildAdapter` entry
- Node test in `tests/adapter.spec.mjs`

Quick start per adapter:

```bash
cd app/adapters/<openapi|asyncapi|postgres>
npm install
npm test
npm run build -- --spec ./fixtures/<file> --out ../../artifacts/adapters/<name>
```

Artifacts are written to `app/artifacts/adapters/<name>/` and include `catalog.json`, a summary, and a copy of the source spec.

