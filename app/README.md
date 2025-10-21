# OSSP-AGI App/Ops Toolkit

The `app/` folder hosts application-focused and operational tooling, demo services, and generated artifacts used in WSAP and release workflows.

Highlights:
- `app/cli/` — ops scripts: WSAP demo (`wsap.mjs`), release gates (`release-*.mjs`), signing (`sign.mjs`/`verify.mjs`), perf budgets (`perf-status.mjs`).
- `app/services/` — small demo services and utilities (e.g., registry server, metrics ingest).
- `app/artifacts/` — generated artifacts from demos (catalog, diagrams, signed reports).
- `app/config/` — security and performance budget configuration.

Examples:
- WSAP demo: `node app/cli/wsap.mjs`
- Perf budgets gate: `node app/cli/perf-status.mjs --root <log-root> --session <id> --json`
- Release preflight: `node app/cli/release-preflight.mjs`

Notes:
- This is distinct from the repository developer CLI in `cli/`, which provides catalog/workbench/security and perf status UX.
- Some tests import helpers from `app/` (e.g., signing libs, registry server) and expect these paths to remain stable.

