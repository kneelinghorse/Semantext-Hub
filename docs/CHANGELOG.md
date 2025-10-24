# Change Log

## 2025-10-26 – Sprint 21 Surface Triage

- MCP runtime surfaces `agent_run` and `workflow_run` now return structured `501` guidance responses instead of stubbed successes.
- Viewer governance tab and stub API were removed; `getGovernance()` throws an explicit `ApiError` with documentation pointers.
- Legacy smoke scaffolds moved to `artifacts/archive/scaffold-smoke-legacy/` and replaced with a README explaining the archival.
