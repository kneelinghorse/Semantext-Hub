# WSAP CLI Surface

The WSAP tooling lives under `app/cli/` and focuses on release automation, adapter
operations, and observability workflows. This document summarizes the commands that
ship with the surface and the guardrails that keep it isolated from the catalog CLI.

## Commands

The table below lists the entry points exposed from `app/cli/`.

| Command file | Description |
| --- | --- |
| `wsap.mjs` | Composite workflow runner that stitches discovery, approval and export steps for WSAP releases. |
| `init-adapter.mjs` | Scaffolds a new adapter workspace with sample manifests and release policies. |
| `perf-status.mjs` | Reads JSONL metrics, evaluates budgets, and reports latency/health for WSAP sessions. |
| `release-canary.mjs` | Orchestrates the canary phase of the release pipeline. |
| `release-preflight.mjs` | Validates metrics, coverage and policy gates before release. |
| `release-promote.mjs` | Promotes a staged release to production once policy checks pass. |
| `release-rollback.mjs` | Rolls back a release safely while emitting metrics. |
| `a2a.mjs` | A2A workflow helper for protocol-to-protocol discovery. |
| `sign.mjs` / `verify.mjs` | Sign and verify artifacts for WSAP distribution. |

Each script is a standalone CLI entry point. `wsap.mjs` bundles several of the others
into a single guided workflow.

## Boundary Guardrails

- **No cross-imports:** `/cli/**` commands are the catalog surface, `/app/cli/**` hosts
  WSAP workflows. ESLint enforces this with `no-restricted-imports`, disallowing any
  path from one surface into the other.
- **Shared logic lives in `src/`:** Cross-surface helpers (e.g. metrics collection,
  catalog graph writers, Draw.io exporters) reside in `src/**`. Both CLIs consume these
  modules rather than calling into each other.
- **Duplicate command detection:** `scripts/ci/check-duplicate-commands.sh` runs in CI
  (via `npm run check:cli-duplicates`) to spot overlapping command filenames. Use it
  when introducing a new CLI entry point. Known, intentional overlaps (currently
  `perf-status`) are maintained via an allowlist in the script.
- **Build artifacts:** Any compiled output should land in a `dist/` folder. The repo
  ignores `cli/commands/dist/` and `app/cli/dist/` to prevent publishing compiled
  copies alongside sources.

## Testing Expectations

- Jest now runs in multi-project mode: `catalog-cli`, `wsap-cli`, and `core`. WSAP CLI
  tests live under `tests/wsap-cli/` and focus on the runnable entry points.
- Shared helpers (for example `src/metrics/perf.js`) ship with dedicated tests under
  `tests/metrics/`, ensuring behaviour is covered once rather than duplicated across
  surfaces.
- When adding a new WSAP CLI command, include at least one test in `tests/wsap-cli/`
  that exercises its happy path, and consider adding unit tests for any shared modules
  you create.
