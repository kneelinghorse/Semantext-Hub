MCP E2E Test
============

Overview
- Spawns `protocol-mcp-server` over stdio using the internal MCP client.
- Exercises a minimal tool path: `protocol_list_test_files` → `protocol_discover_local` → `docs_mermaid`.
- Confirms `agent_run` and `workflow_run` now emit structured 501 responses with guidance.

Files
- `tests/e2e/mcp.e2e.test.ts` – Main E2E test
- `tests/_helpers/mcp-spawn.ts` – Spawns MCP server and manages teardown
- `tests/_helpers/a2a-stub.ts` – Minimal local HTTP stub for A2A

Run Locally
- From `app/`:
  - `npm run test:e2e:mcp`
  - Or `npm test -- tests/e2e/mcp.e2e.test.ts`

Notes
- Test uses `PROTOCOL_ROOT` to access `seeds/openapi/*` and `approved/` manifests.
- A2A stub listens on an ephemeral local port and is injected via `A2A_BASE_URL` into the server process.
- The stub remains in place for compatibility, but the assertions expect the MCP server to return `501` guidance for agent/workflow operations.
- Test completes quickly (<1s on a warm environment) and is hermetic (no external calls).
