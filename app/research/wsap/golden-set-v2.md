# WSAP Golden Set v2

Scope: Expand seeds to include one AsyncAPI and one DDL source; record pinned SHAs and retrieval method.

- AsyncAPI: Streetlights example (v2.6.0)
  - Source: https://github.com/asyncapi/spec/tree/master/examples/2.6.0
  - Raw: https://raw.githubusercontent.com/asyncapi/spec/master/examples/2.6.0/streetlights.yml
  - Saved as: `artifacts/wsap/v2/seeds/streetlights.asyncapi.yml`

- DDL: Pagila sample schema
  - Source: https://github.com/devrimgunduz/pagila
  - Raw: https://raw.githubusercontent.com/devrimgunduz/pagila/master/pagila-schema.sql
  - Saved as: `artifacts/wsap/v2/seeds/pagila.schema.sql`

Retrieval: `node app/scripts/wsap/fetch-seeds-v2.mjs [<output-dir>]`

Outputs:
- `artifacts/wsap/v2/seeds/*` (downloaded files)
- `artifacts/wsap/v2/versions.json` (name, type, source_url, sha256, saved_as)

Notes:
- Sprint 18 graph safety is WARN-only: nodes>2000, edges>6000, memory>80MB ⇒ chunked output.
- Viewer lazily loads `graph.part-###.json` guided by `graph.index.json`.

