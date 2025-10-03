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

## Troubleshooting
- Use `--runInBand` for verbose output on flaky suites.
- Clear Jest cache with `npm --prefix app test -- --clearCache` if snapshot mismatches persist.
- Inspect temporary artifacts in `app/tests/**/artifacts/` when e2e tests fail.
