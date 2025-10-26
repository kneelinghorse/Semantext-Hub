# Sprint 22 Current-State Snapshot

_Generated 2025-10-26T21:35:31.542Z_

## Quality: Tests & Coverage

Source artifacts: `artifacts/test/jest-results.json`, `artifacts/test/coverage-summary.json`, `artifacts/test/assert-coverage.json`

- Jest results not found — ensure CI artifacts are present.
- Coverage thresholds met: ✅ Yes
- Targeted surfaces (>=85% lines) met: ✅ Yes
- Coverage snapshot generated at: 2025-10-26T19:42:47.835Z

| Surface | Actual | Target |
| --- | --- | --- |
| statements | 89.93% | 80.00% |
| functions | 92.85% | 80.00% |
| branches | 76.38% | 70.00% |
| lines | 91.06% | 80.00% |

### Critical Surfaces

| Target | Lines | Threshold | Status |
| --- | --- | --- | --- |
| app/services/registry/server.mjs | 87.23% | 85% | ✅ pass |
| app/ui/authoring/server.mjs | 86.31% | 85% | ✅ pass |

## Performance Snapshot

Source artifact: `artifacts/perf/latest.jsonl` (60 entries)

| Tool | Step | Count | Avg (ms) | P95 (ms) | OK | Errors |
| --- | --- | --- | --- | --- | --- | --- |
| a2a | echo | 30 | 3.07 | 5.00 | 30 | 0 |
| release:canary | a2a.echo | 30 | 3.07 | 5.00 | 30 | 0 |

## API Contracts

- [Minimal AsyncAPI Example](app/artifacts/adapters/asyncapi/minimal.json) (adapter: asyncapi)
- [Swagger Petstore](app/artifacts/adapters/openapi/spec.json) (adapter: openapi) — A sample Pet Store Server based on the OpenAPI 3.0 specification
- [postgres minimal](app/artifacts/adapters/postgres/minimal.json) (adapter: postgres)

## Exit Decision & Next Sprint Focus

✅ Guardrails healthy — Sprint 22 closes with coverage and live telemetry in good standing. Carry this momentum into Sprint 23's end-to-end workbench flow demo.

Sprint 23 entry note: package the import → validate → visualize → document loop into a reproducible demo, leaning on the truthful telemetry and guardrails captured here.

