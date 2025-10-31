# Workspace Cleanup Log – 2025-10-30

## Actions completed
- Purged 64 API, 58 data, and 58 event scaffold smoke bundles from `artifacts/scaffold-smoke` to remove stale generated code and manifests.
- Deleted 33 generated UI preview screenshots from `artifacts/ui/screenshots`.
- Updated `.gitignore` to exclude the entire `artifacts/` tree so future generated bundles, screenshots, and perf logs stay local-only.
- Redirected viewer/_tmp outputs and Playwright perf logs into `tests/_tmp/**` with configurable metrics path (`UI_PREVIEW_METRICS_DIR`) so reruns stay out of git by default.
- Expanded ignore rules to cover `tests/_tmp/` and `artifacts/ui/tmp-e2e/`, then removed legacy tracked `_tmp` JSON artifacts.

## Findings and follow-ups
- Viewer `_tmp` assets now regenerate on demand; monitor future suites to ensure new generated paths land under `tests/_tmp/` (or adopt the env var) before merging.
- Newly added importer/runtime test suites under `tests/importers/` and `tests/runtime/services/` are still staged locally; confirm ownership before promoting them into the tracked tree.
- Remaining branch changes (`packages/runtime/registry`, `scripts/db`, `scripts/perf`, and deleted sprint-21 docs) predate this cleanup and need separate review.

## Suggested next cleanup steps
1. Land the importer/runtime suites (or discard) after owners confirm scope, then wire them into CI.
2. Add a guardrail in the UI tooling to drop screenshots into a local-only temp directory so they never land in the repo.
3. Audit remaining `artifacts/perf/*.jsonl` logs and decide which belong in `tests/_tmp/perf/` vs. curated docs.

## Appendix – Fixture & Artifact Regeneration

| Asset | Location | How to (Re)generate | Notes |
| --- | --- | --- | --- |
| Viewer chunking graph parts | `tests/_tmp/viewer-chunking/` | `npm test -- --runTestsByPath tests/viewer/chunking.spec.mjs` | Test clears the directory, writes deterministic `graph.index.json` + parts. |
| MCP workflow sample | `tests/_tmp/workflow.json` | `npm run test:e2e:mcp` | Jest e2e suite writes the workflow JSON before calling `workflow_run`. |
| UI preview perf log | `tests/_tmp/perf/ui-preview.jsonl` | `npm test -- --runTestsByPath tests/ui/authoring.e2e.spec.mjs` (default) or `UI_PREVIEW_METRICS_DIR=tests/_tmp/perf node scripts/perf/preview-benchmark.mjs` | Env var keeps perf runs out of `artifacts/perf/`. |
| AsyncAPI importer manifests | `tests/fixtures/generated/asyncapi/*.json` | `node -e "const fs=require('fs');const {importAsyncAPI}=require('./packages/runtime/importers/asyncapi/importer.js');(async()=>{const res=await importAsyncAPI('tests/fixtures/asyncapi/kafka-events.yaml');fs.writeFileSync('tests/fixtures/generated/asyncapi/kafka.json', JSON.stringify(res.manifests, null, 2));})();"` | Source specs live in `tests/fixtures/asyncapi/`; update YAML then rerun command per file. |
| OpenAPI importer manifests | `tests/fixtures/generated/openapi/*.json` | `node -e "const fs=require('fs');const { OpenAPIImporter }=require('./packages/runtime/importers/openapi/importer.js');(async()=>{const importer=new OpenAPIImporter();const spec=require('./tests/fixtures/test-fixtures-function/openapi/minimal.json');const manifest=await importer.import(spec);fs.writeFileSync('tests/fixtures/generated/openapi/minimal.json', JSON.stringify(manifest, null, 2));})();"` | Swap the spec path/output filename for other fixtures (e.g., `complex.json`). |
