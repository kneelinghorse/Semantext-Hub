# CMOS Overview

OSSP-AGI’s CMOS (Change Management & Operating Summary) tracks how each sprint hardens the workbench narrative. Use this document to brief stakeholders before publishing the v0.25 launch bundle.

## Release Focus — v0.25 Launch Bundle

- **Scope**: Missions B25.1–B25.2 turn the hardened workbench into a public-ready package with reproducible GitHub/Stripe imports.
- **Artifacts**: `artifacts/launch/v0.25/` contains manifests, diagrams, telemetry snapshots, and the external demo script.
- **Docs Refresh**: README, Getting Started, and CHANGELOG now reference the curated showcase and preflight automation.
- **Validation**: `npm run demo:preflight` and `node scripts/demo/run-external.mjs` rebuild the launch bundle and verify security requirements.
- **Next Steps**: Mission B25.3 (Feedback & Issue Intake) opens community channels and documents post-release follow-up.

For a sprint-by-sprint breakdown, continue using `cmos/missions/backlog.yaml` and mission outcome summaries under `cmos/status/summary/`.
