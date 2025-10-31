# SCH CLI Backlog

This backlog captures follow-up work required to round out the Semantext Hub CLI after the Sprint 01 consolidation mission.

## SCH-CLI-001 — Context Inventory Report
- **Goal:** Provide a concrete `sch context status` command that inspects cached manifests, context bundles, and registry parity.
- **Dependencies:** Context persistence design from `B1.1_local-core-build`.
- **Acceptance:** Emits JSON summary (default table) with counts of manifests, sync timestamps, and drift flags.

## SCH-CLI-003 — Protocol Scaffolding Portal
- **Goal:** Reintroduce scaffold/generate flows under `sch protocol scaffold`.
- **Scope:** Wrapper around existing generators; prompts for manifest type, authoring metadata, and destination paths.
- **Notes:** Replace the deprecated `protocol-generate` binary; ensure provenance metadata references `sch`.

## SCH-CLI-004 — Context Sync Workflow
- **Goal:** `sch context sync` orchestrates regeneration of derived artifacts (graphs, diagrams, registry snapshots).
- **Validation:** Smoke test ensures derived outputs land in `.gitignored` directories and CLI exits zero.
- **Risks:** Avoid reintroducing deleted artifacts under `artifacts/`.

## SCH-CLI-005 — Context Purge Guardrail
- **Goal:** `sch context purge` removes cached data (graphs, tmp dirs) with confirmation guards.
- **Interaction:** Should chain to sync once `SCH-CLI-004` lands to rebuild a clean cache.

## SCH-CLI-006 — Signing & DSSE Utilities
- **Goal:** Restore signing flows (`sign`, `verify`) through `sch context sign` / `sch context verify`.
- **Action:** Wrap DSSE helper modules and ensure provenance metadata references the new CLI identifier.

## SCH-CLI-007 — Protocol Verification Enhancements
- **Goal:** Add `sch protocol verify` that performs signature and schema validation against approved manifests.
- **Notes:** Integrate with automated validation suites and expose `--strict` flag for CI guardrails.

## SCH-CLI-008 — WSAP Automation
- **Goal:** Fold WSAP bootstrap logic into `sch context sync --mode wsap`.
- **Deliverables:** Local express harness launch, graph rebuild, telemetry ingest, deprecation of `app/cli/wsap.mjs`.

## SCH-CLI-009 — Search & Retrieval QA
- **Goal:** Introduce search QA harness aligning with roadmap Sprint 03 requirements.
- **Command:** `sch retrieval search --dataset <name>` (front-load dataset argument contracts).
- **Testing:** Snapshot expected retrieval scores and diff on regressions.

## SCH-CLI-010 — Retrieval Benchmark Harness
- **Goal:** Deliver `sch retrieval qa` to compare retrieval quality across datasets.
- **Status:** Stub available; needs dataset registry and scoring logic.

## Tracking
- All backlog items are referenced by the CLI stubs and documentation to surface the remaining work.
- Progress should be updated in this file as missions land, and deprecated wrappers in `app/cli` should be removed once corresponding commands ship.
