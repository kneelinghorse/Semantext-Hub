# Roadmap — Sprints 21–25

## Guiding Focus
- Treat OSSP-AGI as an exploratory workbench that proves protocol manifests can power real developer workflows.
- Ship polished, trustworthy surfaces (no placeholder governance, no mock metrics) before inviting wider feedback.
- Keep scope intentionally local-first and demo-ready; defer production-scale ambitions until community demand emerges.

---

## Sprint 21 — Secure Workbench Baseline ✅ **COMPLETED**
**Goal:** Land a "truthful by default" runtime and viewer surface so every demo starts from safe, realistic assumptions.

**Delivered:**
- ✅ **S21.1**: Registry requires explicit `REGISTRY_API_KEY`; IAM fails closed (403) without valid policy; startup checklist warns on insecure configs.
- ✅ **S21.2**: MCP/custom protocols return explicit `not_implemented` errors; governance tab removed; [`docs/SPRINT_21_SURFACE_CHANGES.md`](../../docs/SPRINT_21_SURFACE_CHANGES.md) captures the trimmed/disabled surfaces story for downstream docs.
- ✅ **S21.3**: Documentation Reality Pass — README, new [`docs/Getting_Started.md`](../../docs/Getting_Started.md), security policies, and quickstart now align with hardened defaults and remove stale commands/surfaces.

**Outcome:** Clean install requires API key setup; IAM denials log to the audit trail; onboarding docs walk through the truthful workflow with trimmed surfaces. No permissive fallbacks remain.

---

## Sprint 22 — Honest Telemetry & Storytelling
**Goal:** Ensure every metric, gate, and narrative reflects live data.

- Remove perf seeding; make budgets fail when logs are missing or stale; ship lightweight CLI/dashboard for p95 trends.
- Update CI summaries to highlight real discovery/MCP numbers drawn from JSONL logs.
- Capture a short “workbench narrative” doc showing how telemetry fits into the developer story.

**Success:** CI/perf gates turn red only on genuine regressions, and reviewers can point to a single source of truth for performance data.

---

## Sprint 23 — Workbench Flow Showcase
**Goal:** Deliver the end-to-end “import → validate → visualize → document” loop as a polished, reusable demo.

- Curate a real manifest set (API/Event/Workflow) and wire the workflow through registry, CLI, and viewer.
- Finish or hide governance endpoints; remove scaffold TODOs so repo examples feel complete.
- Record the flow (CLI transcript or screencast notes) and bake it into `/docs` for newcomers.

**Success:** A developer can reproduce the full flow in under an hour using only documented steps, with zero placeholder responses.

---

## Sprint 24 — Operational Readiness (Demo Scale)
**Goal:** Add just enough operational rigor that others can run the workbench safely.

- Implement registry backup/restore, WAL health reporting, and log retention/GC scripts.
- Run failure drills (bad DB, missing perf logs) and document recovery steps.
- Add quick-start automation (`make demo`, or similar) that performs pre-flight checks.

**Success:** Backup/restore succeeds in rehearsals, health checks surface issues on start-up, and disk/log usage stays within scripted quotas.

---

## Sprint 25 — External Proof & Open Hand-off
**Goal:** Import 1–2 public specs through the workbench, package the artifacts, and pause for community feedback.

- Run the complete loop on external sources; publish generated diagrams, validation results, and telemetry snapshots.
- Prepare the “launch bundle”: refreshed README, Getting Started, sample data, license notice, and roadmap status.
- Tag v0.25.0 (or similar), share the repo, and set expectations for feedback/issue handling.

**Success:** External reviewers can run the demo, see meaningful outputs from real specs, and know how to provide feedback while the core team transitions to observation mode.

---

## Exit Criteria
- All critical surfaces (registry, CLI, viewer, telemetry) are truthful, documented, and runnable by outsiders.
- Known gaps are either closed or explicitly called out in docs.
- Community launch plan (communications + feedback intake) is in place so we can pause development and learn from real usage.
