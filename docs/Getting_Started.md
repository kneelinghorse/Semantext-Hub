# Getting Started — OSSP-AGI Workbench (Sprint 21 Hardened Defaults)

This guide walks through a reproducible Sprint 21 setup so newcomers can experience the hardened OSSP-AGI workbench exactly as shipped: secure configuration first, trimmed runtime surfaces, and a truthful “discover → validate → visualize” loop.

## Prerequisites

- Node.js 18+
- npm 9+ (bundled with recent Node.js releases)
- Git (for cloning the repository)
- macOS, Linux, or WSL environment with Bash-compatible shell

> **Tip:** Run all commands from the repository root (`oss-protocols`). The CLI examples use `npm run cli -- …`, which forwards arguments to `packages/runtime/cli/index.js`.

## 1. Clone & Install Dependencies

```bash
git clone https://github.com/your-org/oss-protocols.git
cd oss-protocols
npm install
```

## 2. Run the Demo Preflight Automation

The preflight command verifies your toolchain, generates a local registry API key, runs health and retention checks, and dry-runs the curated showcase pipeline. It is the fastest way to confirm your workspace matches the Sprint 24 baseline.

```bash
npm run demo:preflight
```

What to expect:

- ✅ Node.js/npm versions checked alongside required native tooling (`tar`, `sqlite3`).
- ✅ Security configs validated; a fresh API key is written to `var/registry.api-key` if one was not present.
- ✅ Registry health probe, backup archive, and retention cleanup executed (CI defaults to dry-run).
- ✅ Showcase manifests parsed and the pipeline runs (dry-run when `CI=true` or `--dry-run` is provided).

Tip: rerun with `npm run demo:preflight -- --dry-run` to inspect the summary without creating new artifacts.

## 3. Configure Secure Defaults (Required)

Sprint 21 removed permissive fallbacks. The registry refuses to start without an API key and the runtime fails-closed without an IAM policy.

```bash
# Generate or provide an explicit registry API key
export REGISTRY_API_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Create an IAM policy directory + minimal policy
mkdir -p app/config/security
cat > app/config/security/delegation-policy.json <<'EOF'
{
  "mode": "enforce",
  "agents": {
    "urn:agent:runtime:workflow-executor": {
      "allow": ["execute_workflow", "read_manifest"],
      "resources": ["approved/*", "drafts/*"]
    }
  },
  "exemptions": ["public/*"]
}
EOF

# Optional: point OSSP_IAM_POLICY at a different file
export OSSP_IAM_POLICY="$PWD/app/config/security/delegation-policy.json"
```

If you used the preflight script and it generated `var/registry.api-key`, export it with:

```bash
export REGISTRY_API_KEY=$(cat var/registry.api-key)
```

Expected behaviour if either configuration is missing:

- Registry startup exits with `SECURITY ERROR: Registry startup blocked - missing API key`.
- Runtime APIs deny requests with `403` and emit a record to `artifacts/security/denials.jsonl`.

## 4. Import a Sample Protocol

Use the CLI to bring a real contract into the workbench. The example below imports the public Petstore OpenAPI spec.

```bash
# Discover an API protocol
npm run cli -- discover api https://petstore3.swagger.io/api/v3/openapi.json --output artifacts/demos
```

Results:

- `artifacts/demos/petstore-api-protocol.json` – generated protocol manifest
- CLI output summarising discovered endpoints, schemas, and relationships
- The manifest is immediately available to validation/catalog commands

## 5. Validate the Ecosystem

```bash
# Validate everything inside artifacts/demos plus existing approved manifests
npm run cli -- validate --ecosystem --manifests artifacts/demos --format summary
```

Watch for:

- `ok` summary at the bottom (non-zero exit codes flag validation failures)
- Detailed issues when manifests reference missing URNs or invalid schemas

## 6. Explore the Catalog Locally

Start the UI server and open it in your browser.

```bash
npm run cli -- ui --port 3456
# In a separate terminal:
open http://localhost:3456
```

Viewer behaviour aligned with Sprint 21 trimmed surfaces:

- **Catalog + Validation tabs** are live and reflect imported manifests.
- **Governance tab** is intentionally absent; MCP agent/workflow actions return structured `501` responses to avoid advertising unfinished flows.

CLI catalog queries remain available while the UI runs:

```bash
npm run cli -- catalog list --limit 5
npm run cli -- catalog show urn:proto:api:petstore@v3
```

## 7. (Optional) Start the Registry Service

The registry service enforces the same hardened defaults when launched locally.

```bash
node packages/runtime/registry/server.mjs --port 3000
```

- Fails immediately if `REGISTRY_API_KEY` is missing/empty.
- Logs audit records for denied IAM requests.
- `/health` reports WAL status and manifest counts for quick checks.

## 8. Manual Dry-Run Checklist

Use the following list to verify your environment mirrors the hardened Sprint 21 story:

- ✅ `REGISTRY_API_KEY` exported and non-empty.
- ✅ `app/config/security/delegation-policy.json` present with enforced mode.
- ✅ `npm run cli -- discover api …` completes and writes manifests into `artifacts/…`.
- ✅ `npm run cli -- validate --ecosystem` exits successfully (or surfaces actionable errors).
- ✅ Viewer reachable at `http://localhost:3456` with catalog + validation tabs only.
- ✅ MCP agent/workflow triggers return `501` responses (no silent stubs).
- ✅ `artifacts/security/denials.jsonl` captures denied calls when policy is restrictive.

## Next Steps

- Read the full security posture: [`docs/security/SECURITY_POLICIES.md`](security/SECURITY_POLICIES.md)
- Review trimmed surfaces and guided 501 responses: [`docs/SPRINT_21_SURFACE_CHANGES.md`](SPRINT_21_SURFACE_CHANGES.md)
- Track roadmap context: [`cmos/docs/roadmap-sprint-21-25.md`](../cmos/docs/roadmap-sprint-21-25.md)

By completing this guide you have exercised the hardened workbench narrative targeted by Mission S21.3. Future missions (e.g., S22 Truthful Performance Pipeline) build directly on this baseline.
