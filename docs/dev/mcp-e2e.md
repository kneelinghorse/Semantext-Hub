MCP E2E Test
============

Overview
- Spawns `protocol-mcp-server` over stdio using the internal MCP client.
- Exercises a minimal tool path: `protocol_list_test_files` → `protocol_discover_local` → `docs_mermaid`.
- Includes a tiny in-test A2A HTTP stub that handles `agent_run` and `workflow_run` without any real network.

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
- Test completes quickly (<1s on a warm environment) and is hermetic (no external calls).

