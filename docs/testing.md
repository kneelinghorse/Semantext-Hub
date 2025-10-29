# Testing Strategy

## Overview
The OSS Protocols workspace uses Jest for all automated testing. The suite covers:
- **Unit tests** for core modules (`app/core/**`, `app/validation/**`, `app/core/governance/**`).
- **Integration tests** for overrides, diff engine, and workflow orchestration.
- **End-to-end tests** that exercise the CLI discover → review → approve flow with mocked data sources.

## Running Tests
From the project root:
```bash
npm test
```
This command forwards to `npm --prefix app test`, executing the full Jest suite inside the `app/` package.

### Targeted Suites
Run a subset by providing a pattern:
```bash
npm --prefix app test tests/governance/generator.test.js
npm --prefix app test tests/e2e/openapi-workflow.test.js
```

## Quality Gates
- Enforced coverage thresholds in CI: global (branches ≥60%, functions ≥70%, lines ≥70%, statements ≥70%) plus critical-path minimums for `packages/runtime/viewer/routes/api.mjs`, `packages/runtime/registry/server.mjs`, and `app/ui/authoring/server.mjs`.
- `npm run test:ci` runs with coverage and fails the build if these thresholds regress; `npm run verify:coverage` can be used locally to inspect stored coverage summaries.
- Keep governance generation under 100 ms for 100 protocols.
- Ensure new features land with focused unit tests and, when applicable, workflow tests.

## Coverage Reporting
Mission GTC.1 expands Jest `collectCoverageFrom` targets beyond the original 5 directories. The coverage configuration in `jest.config.js` now tracks:
- `app/cli/**/*.{js,mjs,cjs}` and `app/services/**/*.{js,mjs,cjs}` for all CLI entry points and supporting services.
- `app/adapters/**/*.{js,mjs,cjs}` and `app/importers/**/*.{js,mjs,cjs}` to follow runtime integrations owned by the app package.
- `packages/runtime/{cli,services,runtime,workflow,importers,adapters}/**/*.{js,mjs,cjs}` to measure coverage across runtime orchestration, pipelines, and adapters.
- Existing mission surfaces such as `packages/runtime/viewer/routes`, `packages/runtime/registry`, `app/ui/authoring`, `app/libs/signing`, and shared test helpers.

Generated assets and scaffolding remain excluded to keep the signal focused:
- `examples/`, `templates/`, `scripts/`, `seeds/`, `dist/`, `build/`, and coverage/artifact directories are tooling outputs.
- `__tests__`, `__mocks__`, `__fixtures__`, and `__generated__` directories contain harness code or generated data.
- `packages/runtime/registry/start.mjs` is a bootstrap shim duplicated by CLI flows.
- `app/ui/authoring/web/**` ships prebuilt frontend bundles that are not instrumented.
- `app/cli/**` and `packages/runtime/cli/**` entrypoints execute via spawned Node processes; coverage gates instead track the underlying services and libraries they call.
- `packages/runtime/services/mcp-server/performance-optimizations.js` focuses on runtime tuning toggles that are exercised via dedicated perf harnesses.

Run coverage locally with:
```bash
npm test -- --coverage --maxWorkers=2
```
Coverage may dip while teams backfill tests for the newly tracked surfaces; that is expected and informs follow-up missions.

After a coverage run, validate the stored report with:
```bash
npm run verify:coverage
```
This mirrors the CI quality-gate step and prints a concise summary of any failing thresholds.

## Troubleshooting
- Use `--runInBand` for verbose output on flaky suites.
- Clear Jest cache with `npm --prefix app test -- --clearCache` if snapshot mismatches persist.
- Inspect temporary artifacts in `app/tests/**/artifacts/` when e2e tests fail.
