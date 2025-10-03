Protocol-Driven Discovery & Catalog — 6-Week Development Roadmap (Final Spec)
Executive Summary
Build a manifest-free demo that discovers real contracts from public sources (OpenAPI URLs, APIs.guru entries, read-only Postgres, AsyncAPI URLs) and converts them into your API/Data/Event/Semantic protocol manifests.
Bake in a human-in-the-loop approval step (draft → review → finalize) and ship a first-class GOVERNANCE.md report from day one.
Target an MVP by Week 1–2; Web UI is a viewer only in Week 3 with Semantic Protocol dogfooding; AsyncAPI/event importer is a stretch for Week 4.
URN Scheme
All manifests use stable URNs for cross-protocol references:

Grammar: urn:proto:<kind>:<authority>/<id>[@<version>][/<subpath>]
Kinds: api | api.endpoint | data | event | semantic
Examples:

urn:proto:api:github/billing@1.2.0
urn:proto:api.endpoint:github/billing@1.2.0/GET/%2Fv1%2Finvoices
urn:proto:data:warehouse/billing/invoices@2.0.0
urn:proto:semantic:viewer/governance



Timeline Overview

Week 1 (MVP): API & DB importers, draft/approve workflow, CLI
Week 2: Validators, GOVERNANCE.md with ProtocolGraph, provenance, overrides, curated seeds
Week 3: Web UI (viewer-only) with Semantic Protocol dogfooding
Week 4 (Stretch): AsyncAPI importer + basic event delivery checks
Week 5: Caching, CI/GitHub Action, packaging, security redaction, templates
Week 6: Launch: docs, examples, demo video, community push

Week 1: Foundation — Importers, Draft/Approve, CLI (MVP)
Goal
Turn public inputs into draft manifests and artifacts via CLI, with explicit human approval.
Technical Milestones
API Importer (OpenAPI 3.x URL)

Parse OAS; map to API Protocol: authentication, endpoints, request/response, errors, pagination, long_running
Extract components.schemas → validation.schemas
Generate URNs for service and each endpoint
Output api-manifest.draft.json with metadata: {status:'draft', source_url, fetched_at, source_hash, review_state: 'DISCOVERED'}

DB Importer (Postgres)

Read-only connect; introspect tables/views, PK/FK/unique, types
Sample row counts & per-column null-rates; heuristic PII detection (email/phone/ssn/dob/name)
Generate dataset URNs: <catalog>/<schema>/<table>
Output data-manifest.draft.json with provenance metadata

CLI Skeleton
Discovery:
bashprotocol-discover api https://.../openapi.json --out artifacts/api-manifest.draft.json
protocol-discover db  postgresql://user:pass@host:5432/db --out artifacts/data-manifest.draft.json
Review/Approve:
bashprotocol-review artifacts/api-manifest.draft.json         # prints summary & suggestions
protocol-approve artifacts/api-manifest.draft.json \
  --accept pii,email --accept pagination \
  --reject long_running \
  --final artifacts/api-manifest.json --approved-by "<you>"
Generate & Report:
bashprotocol-generate sdk artifacts/api-manifest.json --out artifacts/sdk/
protocol-generate migrations artifacts/data-manifest.json --out artifacts/migrations/
protocol-report governance artifacts/*.json --out artifacts/GOVERNANCE.md
Success Criteria

Import 2 public APIs + 1 Postgres; produce drafts; approve; generate SDK/migration; create GOVERNANCE.md
End-to-end in <10 minutes from zero

Week 2: Protocol Glue, GOVERNANCE.md, Provenance & Overrides
Goal
Lean into validators/diffs; make governance the star; add resilience knobs.
Technical Milestones
ProtocolGraph Implementation
javascriptclass ProtocolGraph {
  nodes = new Map<string, { kind: NodeKind, manifest: any }>();
  edges = new Map<string, Array<{ kind: EdgeKind, to: string }>>();
  
  tracePIIForEndpoint(endpointUrn: string): Array<{dataset: string, field: string, urn: string}>
  impactOfChange(urn: string): {direct: string[], transitive: string[], breaking: boolean}
}
GOVERNANCE.md v1 (auto-generated)

Security posture (auth type/scopes, typed errors, rate limits, LRO hints)
PII exposure paths using ProtocolGraph: "GET /v1/users exposes PII from 3 upstream datasets"
Policy checklist (retention, encryption-at-rest, DLQ)
Delivery & resilience (DLQ present? retry policy?)
Provenance block (source_url, fetched_at, hash)
URN cross-references with unresolved warnings

Review State Machine

States: DISCOVERED → IN_REVIEW → PARTIAL → APPROVED → DEPLOYED
Artifacts: *.draft.json + suggestions.json (JSON-Patch ops with reason, severity)
Accepted patches written to mapping.overrides.json

Community Overrides Format
json{
  "version": "1.0.0",
  "rules": [{
    "id": "github-api-oauth",
    "match": {"type": "api", "source_url": {"contains": "api.github.com"}},
    "patches": [{"op": "set", "path": "interface.authentication.type", "value": "oauth2"}],
    "confidence": 0.95,
    "rationale": "GitHub API uses OAuth2",
    "verified_count": 42
  }]
}
Curated Seeds
javascriptexport const CURATED_APIS = {
  'stripe': {
    url: 'https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json',
    overrides: 'https://raw.githubusercontent.com/protocol-community/overrides/main/stripe.json'
  },
  'github': { /* ... */ }
};
Success Criteria

One-command demo path yields GOVERNANCE.md with at least three actionable findings
CI mode exits non-zero on policy violations

Week 3: Web UI (Viewer-Only) with Semantic Dogfooding
Goal
Let users explore results without backend complexity. Dogfood Semantic Protocol on the viewer itself.
Technical Milestones
protocol-ui ./artifacts

Tabs: Validate, Diff, SDK, Migrations, Governance, Provenance
Highlight PII, auth posture, missing DLQ/retention
Search box to run tiny queries (e.g., schema.pii:contains:email)
No in-browser importing yet; all discovery via CLI

Semantic Protocol Dogfooding
javascript// Auto-discover and manifest all UI panels on startup
class ViewerApp {
  async initialize() {
    const panels = document.querySelectorAll('[data-semantic-role]');
    
    for (const panel of panels) {
      const manifest = semanticProtocol.createManifest({
        id: panel.id,
        type: 'panel',
        role: panel.dataset.semanticRole,
        intent: panel.dataset.semanticIntent,
        semantics: {
          category: panel.dataset.semanticCategory || 'viewer',
          purpose: panel.dataset.semanticPurpose,
          capabilities: (panel.dataset.semanticCapabilities || '').split(',')
        },
        metadata: { 
          urn: `urn:proto:semantic:viewer/${panel.id}`
        }
      });
      
      panel.semanticManifest = manifest;
    }
    
    // Generate self-documentation
    const uiTests = semanticProtocol.generateTests(
      semanticProtocol.query('type:panel')
    );
  }
}
Alt-Click Overlay

Shows the semantic manifest of the panel under cursor
Demonstrates the protocol describing the viewer itself
Can query panels: semanticProtocol.query("capabilities:contains:export-markdown")

Success Criteria

Open artifacts from Week 1–2 and clearly visualize value
Alt-Click any panel to see its semantic manifest
Copy-paste SDK/migration

Week 4 (Stretch): AsyncAPI/Event Importer
Goal
Add async breadth if time permits—keep scope tight.
Technical Milestones
AsyncAPI URL → Event manifest

Channels/messages → schema.payload
Map delivery hints (transport/topic, guarantees, retry, DLQ)
PII detection on payload fields; lifecycle/compatibility defaults
Generate event URNs: urn:proto:event:<name>@<version>

Generated artifacts

Consumer skeleton + delivery tests (warn on retries without DLQ)

Success Criteria

Import one AsyncAPI example; produce consumer skeleton
GOVERNANCE.md flags delivery/PII gaps

Week 5: Caching, CI, Packaging, Security Redaction, Templates
Goal
Production-feel dev-ex and repeatability.
Technical Milestones
Catalog Index (artifacts/index.json)
json{
  "version": "1.0.0",
  "generated_at": "2024-01-01T00:00:00Z",
  "manifests": {
    "urn:proto:api:billing@1.2.0": {
      "file": "api/billing.json",
      "status": "approved",
      "pii_exposed": ["email", "phone"],
      "dependencies": ["urn:proto:data:warehouse/billing/invoices@2.0.0"]
    }
  },
  "governance": {
    "critical_findings": 2,
    "pii_exposure_count": 14,
    "missing_dlq": ["payment.failed"]
  },
  "graph": {
    "nodes": 42,
    "edges": 67,
    "cycles": []
  }
}
CI/GitHub Action

Nightly discover → validate → diff → governance
Open PR with updated manifests/artifacts
Include URN resolution warnings

Packaging

Publish as @yourorg/protocol-discover (Node/TS)
create-protocol-demo scaffolds working example

Success Criteria

Clean failure modes; retries; clear warnings
Fresh project can npx create-protocol-demo and run successfully

Week 6: Launch & Adoption
Goal
Make it easy (and fun) to try today.
Documentation & Content

Quickstarts; copy-paste CLI; UI walkthrough
Governance explainer; troubleshooting
Demo video/GIFs showing Alt-Click semantic overlay
Blog post: "why governance, not just codegen"

Success Criteria

200+ stars, 100+ installs, first external PRs/issues

Implementation Gotchas

URN/version drift: Accept @~1.2 by default; warn if major mismatch
Graph cycles: Report in GOVERNANCE.md using visited set
PII propagation: Only from finalized manifests
Overrides precedence: community < org-wide < project-local
Endpoint URN stability: Base on method+path, normalize for comparison

Resource Requirements

Dev: 1–2 engineers, 6 weeks
Stack: Node/TS + pg + OpenAPI/AsyncAPI parsers
Content: Quickstarts, demo video/GIFs, example repos

Conclusion
The pivot from authoring to discovering kills the cold-start problem. The draft → approve workflow de-risks heuristics, and GOVERNANCE.md makes the value obvious to non-dev stakeholders. Semantic Protocol dogfooding demonstrates the system's own principles. This plan is buildable in 6 weeks and compelling from the first demo.