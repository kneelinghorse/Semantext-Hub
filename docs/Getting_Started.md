# Getting Started — OSSP-AGI Workbench (v0.25 Launch Bundle)

This guide walks through the v0.25 release flow so newcomers experience the hardened OSSP-AGI workbench exactly as we ship it: run the preflight, regenerate the curated GitHub/Stripe showcase, and explore the “discover → validate → visualize” loop with truthful telemetry.

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

The preflight command verifies your toolchain, generates a local registry API key, runs health and retention checks, and rebuilds the curated external showcase artifacts. It is the fastest way to confirm your workspace matches the v0.25 baseline.

```bash
npm run demo:preflight
```

What to expect:

- ✅ Node.js/npm versions checked alongside required native tooling (`tar`, `sqlite3`).
- ✅ Security configs validated; a fresh API key is written to `var/registry.api-key` if one was not present.
- ✅ Registry health probe, backup archive, and retention cleanup executed (CI defaults to dry-run).
- ✅ GitHub and Stripe manifests parsed; artifacts land in `artifacts/launch/v0.25/` for packaging (dry-run when `CI=true` or `--dry-run` is provided).

Tip: rerun with `npm run demo:preflight -- --dry-run` to inspect the summary without creating new artifacts.

## 3. Configure Secure Defaults (Required)

The hardened defaults introduced in Sprints 21–24 remain in effect. The registry refuses to start without an API key and the runtime fails closed without an IAM policy.

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

## 4. Regenerate the External Showcase (GitHub & Stripe)

Use the curated script from Mission B25.1 to rebuild the launch bundle artifacts. The script copies approved manifests, diagrams, and telemetry into `artifacts/launch/v0.25/`.

```bash
# Rebuild the curated launch bundle showcase
node scripts/demo/run-external.mjs
```

Results:

- `artifacts/launch/v0.25/github/manifest.json` and `stripe/manifest.json`
- Matching diagrams under `artifacts/launch/v0.25/diagrams/`
- Telemetry snapshots and release notes referenced by the launch README
- Regeneration log summarising imported specs and validation status

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

Viewer behaviour aligned with the hardened surfaces:

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

Use the following list to verify your environment mirrors the hardened v0.25 release story:

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

By completing this guide you have exercised the v0.25 launch narrative driven by Missions B25.1 and B25.2. Next, configure feedback and post-launch follow-up with Mission B25.3 once it is promoted.
