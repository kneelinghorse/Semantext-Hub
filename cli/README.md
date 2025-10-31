# Semantext Hub Repo CLI

This directory contains the repository-level CLI used by developers for catalog browsing, visualization, workbench orchestration, security scanning, and performance status reporting.

Key entrypoint: `cli/index.js`

Examples:
- List catalog: `node cli/index.js catalog list --format json`
- View manifest: `node cli/index.js catalog view "Sample Customer API" --format json`
- Generate diagram: `node cli/index.js catalog generate-diagram --output artifacts/diagrams/catalog.drawio --overwrite`
- Security scan: `node cli/commands/security-scan.js --target . --format summary`
- Performance status: `node cli/index.js perf:status --format json`

Notes:
- This CLI is separate from `app/cli`, which hosts app/ops scripts (WSAP demo, release gates, signing, etc.).
- Tests and hooks reference this CLI directly (see `tests/cli/*` and `scripts/hooks/`).
