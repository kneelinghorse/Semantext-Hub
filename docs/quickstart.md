# OSSP-AGI Quickstart Cheatsheet (Sprint 21 Baseline)

This cheatsheet distills the hardened Sprint 21 workflow into a few repeatable commands. For a full walkthrough, see [`docs/Getting_Started.md`](Getting_Started.md).

## 1. Secure the Runtime (one-time per terminal)

```bash
# Install dependencies
npm install

# Registry API key (required)
export REGISTRY_API_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# IAM policy (fail closed by default)
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
# Optional override path
export OSSP_IAM_POLICY="$PWD/app/config/security/delegation-policy.json"
```

## 2. Core CLI Commands

```bash
# Discover protocols
npm run cli -- discover api https://petstore3.swagger.io/api/v3/openapi.json
npm run cli -- discover asyncapi ./seeds/asyncapi/kafka-ecommerce.json
npm run cli -- discover postgres "postgresql://user:pass@localhost:5432/mydb"

# Validate ecosystem
npm run cli -- validate --ecosystem
npm run cli -- validate artifacts/demos/petstore-api-protocol.json --verbose

# Catalog exploration
npm run cli -- catalog list --limit 5
npm run cli -- catalog show urn:proto:api:petstore@v3

# Launch trimmed viewer (catalog + validation tabs only)
npm run cli -- ui --port 3456
open http://localhost:3456
```

## 3. Governance & Registry (optional)

```bash
# Generate GOVERNANCE.md via example script
node app/examples/generate-governance.js

# Start hardened registry service
node packages/runtime/registry/server.mjs --port 3000
```

## 4. Troubleshooting Quick Checks

- Missing API key → registry exits with `SECURITY ERROR`. Re-export `REGISTRY_API_KEY`.
- IAM denials → inspect `artifacts/security/denials.jsonl` and adjust `delegation-policy.json`.
- Viewer governance surface → intentionally disabled; expect `501` responses for MCP agent/workflow calls (see [`docs/SPRINT_21_SURFACE_CHANGES.md`](SPRINT_21_SURFACE_CHANGES.md)).

Keep this cheatsheet handy for day-to-day workflows, and fall back to the full Getting Started guide when you need detailed context or validation steps.
