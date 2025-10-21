Minimal Authoring UI

- Start: `ossp ui --port 3030`
- Endpoints:
  - POST `/validate` :: body={ schema, manifest|manifests, baseDir? }
  - POST `/preview/graph` :: body={ manifest|manifests }
  - POST `/preview/docs` :: body={ manifest|manifests }

Notes
- Uses JSON Schema draft 2020-12 (Ajv 2020) with local `$ref` resolution only.
- Static web app served from `app/ui/authoring/web/` with dark/light toggle.
- Preview requests are logged to `artifacts/perf/ui-preview.jsonl` for p95 tracking.

