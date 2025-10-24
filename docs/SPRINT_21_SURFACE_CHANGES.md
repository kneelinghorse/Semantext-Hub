# Sprint 21 Runtime Surface Area Changes

**Date**: 2025-10-26  
**Mission**: S21.2 Runtime Surface Triage

## Summary

Sprint 21 eliminates the placeholder runtime and viewer surfaces that were still advertised in the workbench. The MCP server now refuses unscheduled agent/workflow execution with structured `501` guidance, the viewer hides the governance preview tab, and the TODO-heavy scaffold smoke assets are archived for historical reference.

## Runtime Surface Triage {#runtime-surface-triage}

**Status**: Agent orchestration surfaces disabled with guidance  
**Files**:
- `packages/runtime/src/agents/runtime.js`
- `packages/runtime/bin/protocol-mcp-server.js`
- `tests/e2e/mcp.e2e.test.ts`
- `packages/runtime/scripts/performance-benchmark.js`

### What Changed
- `agent_run` and `workflow_run` return a deterministic payload: `{ status: 501, ok: false, error: '<surface>_unsupported', guidance: [...] }`.
- Tool descriptions inside the MCP server make it clear the surfaces are disabled in Sprint 21 builds.
- End‑to‑end MCP tests assert the `501` response instead of relying on stubbed A2A traffic.
- Performance tooling no longer simulates the removed operations.

### Rationale
- The runtime build only exposes supported discovery tooling.
- Guided failures are easier to integrate into clients than silent stubs.
- Documentation now has a single source of truth for supported surfaces (see below).

## Viewer Changes {#viewer-changes}

**Status**: Governance UI removed; API surface returns 501  
**Files**:
- `packages/runtime/viewer/client/src/App.jsx`
- `packages/runtime/viewer/client/src/components/Layout.jsx`
- `packages/runtime/viewer/client/src/components/PlaceholderTab.jsx`
- `packages/runtime/viewer/client/src/components/PlaceholderTab.css`
- `packages/runtime/viewer/client/src/lib/api.js`
- `packages/runtime/viewer/client/src/lib/api.test.js`
- `packages/runtime/viewer/client/index.html`

### What Changed
- The governance tab, placeholder banners, and related styles were removed from the viewer.
- `api.getGovernance()` now throws an `ApiError` with status `501` and documentation pointers.
- Layout copy and metadata no longer promise governance tooling.

### Rationale
- Prevents the viewer from advertising experiences that do not exist.
- Keeps the MCP documentation aligned with the runtime responses.

## Scaffold Artifacts {#scaffold-artifacts}

**Status**: Legacy scaffolds archived  
**Files**:
- `artifacts/scaffold-smoke/README.md`
- `artifacts/archive/scaffold-smoke-legacy/**`

### What Changed
- All generated `TODO` scaffolds moved to `artifacts/archive/scaffold-smoke-legacy/`.
- The live `artifacts/scaffold-smoke/` directory now contains a README that points to supported examples (`artifacts/examples/`) and the archive.

### Rationale
- Removes misleading TODO code from the default artifact tree.
- Preserves historical output for troubleshooting without making it look production ready.

## Testing Impact

- MCP end‑to‑end tests expect `501` responses for `agent_run` and `workflow_run`.
- Viewer unit tests assert that `getGovernance()` rejects with an `ApiError`.
- No other suites exercise the removed scaffolds.

## User Impact

**Before Sprint 21**:
- MCP clients saw stubbed successes for agent/workflow execution.
- The viewer highlighted a governance tab backed by semantic placeholder data.
- Generated scaffold artifacts contained TODOs and incorrect naming conventions.

**After Sprint 21**:
- MCP clients receive actionable guidance to stick with discovery tooling.
- The viewer focuses on health, manifests, validation, and graph exploration.
- Scaffold smoke assets are archived until real samples ship.

## References

- Mission plan: `cmos/missions/sprint-21/S21.2_Runtime-Surface-Triage.yaml`
- Roadmap context: `cmos/docs/roadmap-sprint-21-25.md`
- Follow-up mission: S21.3 Documentation Reality Pass
