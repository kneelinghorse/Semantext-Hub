# External Spec Showcase

Sprint 25 validates the workbench on public OpenAPI specifications. The run below captures the inputs, generated artifacts, and telemetry to include in the launch bundle.

## GitHub REST API
- Source: https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json
- Manifest: `approved/external/github/manifest.json`
- Diagram: `artifacts/diagrams/external-github.drawio`
- Telemetry: `artifacts/perf/external-github.jsonl`
- Highlights: repository/issue flows validated, OAuth governance warnings cleared.

## Stripe Payments API
- Source: https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json
- Manifest: `approved/external/stripe/manifest.json`
- Diagram: `artifacts/diagrams/external-stripe.drawio`
- Telemetry: `artifacts/perf/external-stripe.jsonl`
- Highlights: payment intents, refunds, and customer lifecycle tested with PCI guardrails enabled.

## Next Steps
Use `node scripts/demo/run-external.mjs` to regenerate the artifacts. The script supports `--dry-run` for validation and `--workspace` to target alternate directories.

Bundled copies for release live under `artifacts/launch/v0.25/` and are rebuilt automatically by `node scripts/release/create-launch-bundle.mjs`.
