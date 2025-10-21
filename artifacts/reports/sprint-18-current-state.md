# Sprint 18 Current-State Snapshot

_Generated 2025-10-21T01:23:44.606Z_

## Quality: Tests & Coverage

Source artifacts: `artifacts/test/jest-results.json`, `artifacts/test/coverage-summary.json`

- Suites: 133 passed / 134 total (1 pending)
- Tests: 2068 passed / 2070 total (2 pending)
- Coverage thresholds met: ⚠️ No
- Coverage snapshot generated at: 2025-10-20T02:06:50.144Z

| Surface | Actual | Target |
| --- | --- | --- |
| statements | 39.73% | 80.00% |
| functions | 41.55% | 80.00% |
| branches | 31.53% | 70.00% |
| lines | 49.18% | 80.00% |

## Performance Snapshot

Source artifact: `artifacts/perf/latest.jsonl` (1659 entries)

| Tool | Step | Count | Avg (ms) | P95 (ms) | OK | Errors |
| --- | --- | --- | --- | --- | --- | --- |
| a2a | echo | 744 | 18.24 | 5.00 | 128 | 616 |
| release:canary | a2a.echo | 636 | 20.82 | 5.00 | 20 | 616 |
| wsap | approve | 19 | 7.79 | 12.66 | 19 | 0 |
| wsap | catalog | 19 | 3.29 | 6.17 | 19 | 0 |
| wsap | cytoscape | 19 | 1.66 | 3.68 | 19 | 0 |
| wsap | diagram | 19 | 8.08 | 10.44 | 19 | 0 |
| wsap | docs | 19 | 0.04 | 0.17 | 19 | 0 |
| wsap | import | 19 | 28.62 | 50.75 | 19 | 0 |
| wsap | ingest | 19 | 36.42 | 58.01 | 19 | 0 |
| wsap | open | 19 | 0.74 | 13.23 | 19 | 0 |
| wsap | plan | 19 | 17.24 | 42.95 | 19 | 0 |
| wsap | a2a | 18 | 21.23 | 55.63 | 18 | 0 |
| wsap | registry | 18 | 41.08 | 64.81 | 18 | 0 |
| wsap | report | 18 | 0.56 | 2.13 | 18 | 0 |
| wsap | runtime | 18 | 62.31 | 94.33 | 18 | 0 |
| wsap | sign | 18 | 3.07 | 29.46 | 18 | 0 |
| registry | registry_get | 6 | 0.64 | 1.07 | 6 | 0 |
| registry | registry_put | 6 | 6.06 | 15.99 | 6 | 0 |
| registry | resolve | 6 | 0.35 | 0.49 | 6 | 0 |

## API Contracts

- [Minimal AsyncAPI Example](app/artifacts/adapters/asyncapi/minimal.json) (adapter: asyncapi)
- [Swagger Petstore](app/artifacts/adapters/openapi/spec.json) (adapter: openapi) — A sample Pet Store Server based on the OpenAPI 3.0 specification
- [postgres minimal](app/artifacts/adapters/postgres/minimal.json) (adapter: postgres)

## Exit Decision & Next Sprint Focus

⚠️ Sprint 18 exits with follow-up actions: automated coverage remains below thresholds (lines at 49.18% vs 80% target) and performance logs include error samples. Carry these into Sprint 19 security enforcement + release gate hardening.

Sprint 19 entry note: prioritize security enforcement, raise coverage to thresholds, and harden release gates based on the above telemetry.

