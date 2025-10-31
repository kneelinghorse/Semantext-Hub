# Change Log

## 2025-10-27 – Sprint 25 Release: Launch Bundle & Docs

**Mission B25.2**: Package the v0.25 launch bundle with refreshed docs and release automation.

- **README & Getting Started**: Updated to reference the launch bundle flow, preflight automation, and curated GitHub/Stripe showcase.
- **CMOS Overview**: Added release section summarising scope, artifacts, validation, and next steps.
- **Launch Bundle Directory**: Created `artifacts/launch/v0.25/` to hold manifests, diagrams, telemetry, and scripts sourced from Missions B24–B25.
- **Release Script**: `scripts/release/create-launch-bundle.mjs` rebuilds the directory from approved assets.
- **CHANGELOG**: Captures Sprint 25 highlights across missions B25.1–B25.2 and points at B25.3 for post-launch feedback work.

---

## 2025-10-27 – Sprint 23 Demo Story Locked

**Mission B23.3**: Capture a truthful, reproducible walkthrough for the curated order-fulfillment showcase.

- **Guided Walkthrough**: [`docs/demos/showcase.md`](demos/showcase.md) now documents exact commands, expected console output, guardrail warnings, and troubleshooting notes for the demo pipeline.
- **Narration Outline**: Added [`docs/demos/showcase-script.md`](demos/showcase-script.md) to script a 5–7 minute presentation of the showcase story.
- **Visual Asset**: Committed `docs/demos/assets/showcase-pipeline.png` for decks and documentation previews.
- **Surface Entry Point**: `README.md` links directly to the walkthrough so newcomers discover the demo path without digging.

## 2025-10-26 – Sprint 22 Complete: Honest Telemetry & Storytelling

**Sprint Goal**: Ensure every metric, gate, and narrative reflects live data—no seeded placeholders, no stale logs.

### Truthful Performance Pipeline (S22.1)

- **Removed Mock Seeding**: Deleted `seedMockPerfData()` entirely; all metrics come from real WSAP operations.
- **Hard-Fail on Missing Logs**: `collectWorkspacePerfMetrics()` throws when logs are missing or empty (no fallback behavior).
- **File Age Validation**: CI perf gates require logs <24 hours old to prevent running against stale data.
- **Live CI Summaries**: GitHub Actions workflow shows live p95 values from JSONL logs in job summaries.
- **Telemetry Documentation**: `artifacts/perf/README.md` documents JSONL format and field requirements.

### Perf Snapshot CLI/Dashboard (S22.2)

- **CLI Command**: `npm run cli -- perf:report` with `--format table|json` options.
- **Percentile Metrics**: Displays p50/p95/p99 for discovery, MCP, and registry operations.
- **Budget Compliance**: Shows pass/fail status against performance thresholds (discovery p95 < 1s, MCP p95 < 3s, registry p95 < 100ms).
- **Exit Codes**: Returns exit code 1 on budget violations for CI integration.
- **NPM Scripts**: Added `npm run perf:report` and `npm run perf:budget` shortcuts.
- **Test Coverage**: 17 passing tests covering table/JSON formats, percentile calculations, and budget checks.

### Workbench Narrative Update (S22.3)

- **New Documentation**: Published [`docs/workbench-telemetry.md`](workbench-telemetry.md) explaining:
  - Data flow from WSAP runs to JSONL logs to dashboards
  - Truth guarantees (no mocks, fail-fast on staleness, budget enforcement)
  - Integration with import → validate → visualize → document workflow
  - Developer use cases and CI integration patterns
- **README Updates**: Added telemetry reference in "Why Use Semantext Hub" and documentation index.
- **Roadmap Updates**: Marked Sprint 22 complete in [`cmos/docs/roadmap-sprint-21-25.md`](../cmos/docs/roadmap-sprint-21-25.md).
- **CHANGELOG**: This entry captures Sprint 22 achievements.

### Key Performance Targets

- Discovery operations: p95 < 1000ms ✅
- MCP operations: p95 < 3000ms ✅
- Registry operations: p95 < 100ms ✅
- CLI report generation: <200ms ✅
- Test suite: 2000+ tests passing ✅

### Breaking Changes

None. Sprint 22 is additive: new CLI commands and docs enhance existing workflows without breaking changes.

---

## 2025-10-24 – Sprint 21 Complete: Secure Workbench Baseline

**Sprint Goal**: Land a "truthful by default" runtime and viewer surface so every demo starts from safe, realistic assumptions.

### Security Hardening (S21.1 – Secure Registry & IAM Defaults)

- **Registry API Key Enforcement**: Registry now **requires** explicit `REGISTRY_API_KEY` environment variable. No insecure defaults (e.g., `"local-dev-key"`) are provided.
- **IAM Fail-Closed**: IAM authorization denies requests (403) when no policy matches. No permissive fall-through mode.
- **Startup Checklist**: Registry and IAM services validate configuration at startup and refuse to start if API key or policy is missing.
- **Audit Logging**: All IAM denials logged to `artifacts/security/denials.jsonl` (configurable via `OSSP_IAM_AUDIT_LOG`).
- **Documentation**: Updated security policies and onboarding docs with required setup steps.

### Runtime Surface Triage (S21.2 – Runtime Surface Cleanup)

- **MCP Protocol Surfaces**: `agent_run` and `workflow_run` now return structured `501 Not Implemented` responses with guidance instead of stubbed successes.
- **Custom Protocols**: Custom protocol endpoints return explicit `not_implemented` errors with documentation pointers.
- **Governance Tab**: Viewer governance tab removed; `getGovernance()` API throws `ApiError` with clear stub messaging.
- **Documentation**: Updated docs to reflect A2A-only support; MCP marked as experimental/limited.

### Documentation Reality Pass (S21.3 – This Mission)

- **README.md**: Repositioned Semantext Hub as a "Protocol Discovery Workbench", corrected CLI examples, and added hardened-surface callouts.
- **Getting Started Guide**: New [`docs/Getting_Started.md`](Getting_Started.md) walks through secure setup, validation, and viewer behaviour (trimmed surfaces + 501 responses).
- **Security Policies & Quickstart**: Updated to reference the current registry start command and fail-closed onboarding steps; removed stale references (e.g., docker/app paths, governance CLI).
- **Change Log**: Consolidated Sprint 21 achievements here and linked to [`docs/SPRINT_21_SURFACE_CHANGES.md`](SPRINT_21_SURFACE_CHANGES.md) for trimmed/disabled surface details.

### Breaking Changes

- ⚠️ **Registry API Key**: `REGISTRY_API_KEY` is now **required**. Services will not start without it.
- ⚠️ **IAM Policy**: IAM requires an explicit delegation policy file. Missing policies cause startup failure.
- ⚠️ **MCP Endpoints**: `agent_run` and `workflow_run` return 501, not stubbed successes.

### Migration Guide

**Before (Sprint ≤20)**:
```bash
# Insecure: Registry started without API key
node packages/runtime/registry/server.mjs  # Used fallback "local-dev-key"
```

**After (Sprint 21+)**:
```bash
# Secure: Explicit API key required
export REGISTRY_API_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
node packages/runtime/registry/server.mjs
```

See [`docs/security/SECURITY_POLICIES.md`](security/SECURITY_POLICIES.md) for full migration instructions.

---

## 2025-10-18 – Sprint 18 Complete: Adapter Pack & Registry HTTP

- Adapter Pack v1: Scaffolded OpenAPI/AsyncAPI/Postgres adapters with agent cards and smoke tests.
- WSAP Seeds Expansion: Fetched v2 seeds with versions.json; CLI warns on large graphs; viewer lazy loading.
- Docs Pipeline: Build script, Authoring Guide v2, Adapter Cookbook, UI/CLI help links, and CI link checks.
- Registry HTTP Service: `/openapi.json` endpoint, localhost-only CORS, and HEALTHCHECK validation.
- Signature Policy (Permissive): CLI `security:verify` produces `artifacts/security/signature-report.json`.
- IAM Basic Checks: Policy + `authorize()` + runtime hook with permissive WARN mode and audit JSONL.
- Viewer APIs: POST `/api/validate` and `/api/graph` with chunk cache, client wiring, and smoke artifacts.

---

## 2025-10-16 – Sprint 16 Complete: Signing & Registry v2

- Signing Envelope: `identity-access` protocol spec with signing libs, CLI commands, and protocol hooks.
- Registry v2: Signed write verification, URN index persistence, and API test coverage.
- Capability Queries: Capability query endpoint with capability index sidecar and API tests.
- A2A Client (Resilient): Retry logic, exponential backoff, auth providers, and metrics logging.
- WSAP v2 (Multi-Agent): Registers signed agents, exercises A2A, signs reports for verification.

---

## 2025-10-15 – Sprint 15 Complete: Metrics & Performance Gates

- Metrics Ingest: JSONL writer for live WSAP and registry metrics to `artifacts/perf/latest.jsonl`.
- CI Perf Gate: Hard-fail budgets on missing data; script, workflow, and tests landed.
- WSAP v1: Pipeline orchestration with artifacts, metrics, and end-to-end tests.

---

## Earlier Sprints

See [`reports/`](../reports/) and [`cmos/docs/`](../cmos/docs/) for detailed mission histories.
