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
- Maintain ≥90% coverage for critical modules (protocol graph, validators, overrides).
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

Run coverage locally with:
```bash
npm test -- --coverage --maxWorkers=2
```
Coverage may dip while teams backfill tests for the newly tracked surfaces; that is expected and informs follow-up missions.

## Troubleshooting
- Use `--runInBand` for verbose output on flaky suites.
- Clear Jest cache with `npm --prefix app test -- --clearCache` if snapshot mismatches persist.
- Inspect temporary artifacts in `app/tests/**/artifacts/` when e2e tests fail.
