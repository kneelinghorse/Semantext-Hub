# Current Mission: B3.1 - Web Viewer Foundation
*Week 3, Day 1 - Express Server & React Viewer*

## Mission Status
- **Phase**: Week 3 - Web Viewer & Semantic Protocol
- **Mission ID**: B3.1
- **Status**: QUEUED (Ready to Start)
- **Target Start**: 2025-10-03
- **Target Completion**: 2 days
- **Dependencies**: B2.5 Curated Seeds ✅, All Week 2 missions complete ✅
- **Focus**: Build Express API server and React viewer with Semantic Protocol dogfooding

---

## Previous Mission Recap – B2.5 (Complete ✅)
- SeedCurator API with manifest validation and override bundling
- SeedRegistry for fast metadata lookup by type and tags
- 3 OpenAPI seeds: Stripe (25 endpoints, 12 overrides), GitHub (15 endpoints, 8 overrides), Petstore (8 endpoints)
- 2 PostgreSQL seeds: Northwind (13 tables), Sakila (16 tables) with Docker Compose
- CLI demo command with list, run, and db subcommands
- 31 passing tests with full coverage
- Example script demonstrating seed system usage
- Zero-config demos: one command to run pre-configured imports

### B2.5 Deliverables Checklist
- [x] SeedCurator with manifest validation and override loading
- [x] SeedRegistry with fast lookup by type and tags
- [x] Stripe OpenAPI seed with 12 override rules
- [x] GitHub OpenAPI seed with 8 override rules
- [x] Petstore OpenAPI seed (baseline)
- [x] Northwind PostgreSQL Docker Compose with seed data
- [x] Sakila PostgreSQL Docker Compose with seed data
- [x] CLI demo command (list, run, db subcommands)
- [x] 31 passing tests
- [x] Example script (`app/examples/seeds-demo.js`)

### B2.5 Documentation Wrap-up *(2025-10-02)*
- [x] PROJECT_CONTEXT.json updated with seeds achievements
- [x] AI_HANDOFF.md updated for B3.1 kickoff
- [x] Session recorded in `SESSIONS.jsonl`
- [x] `missions/current.md` transitioned to B3.1 focus

---

## Mission Overview – B3.1 Web Viewer Foundation
Build an Express server to serve protocol manifests and a React viewer to visualize protocol panels, dogfooding the Semantic Protocol for describing the viewer itself.

### Why This Matters
- Makes protocol data accessible through web interface
- Demonstrates Semantic Protocol usage (dogfooding)
- Enables interactive exploration of protocol relationships
- Provides foundation for Week 3 deliverables

---

## Implementation Plan

### Phase 1: Seed Curator API
- [ ] Design seed manifest structure and curator API
- [ ] Implement seed loader with bundled override resolution
- [ ] Build seed validator for manifest completeness
- [ ] Create seed registry for available demonstrations

### Phase 2: Pre-Configured Seeds
- [ ] Stripe OpenAPI seed with 12 override rules
- [ ] GitHub OpenAPI seed with 8 override rules
- [ ] Petstore OpenAPI seed as baseline example
- [ ] Bundle manifests with metadata and documentation

### Phase 3: Docker Database Seeds
- [ ] Northwind PostgreSQL Docker Compose configuration
- [ ] Sakila PostgreSQL Docker Compose configuration
- [ ] Seed data loading scripts
- [ ] Connection configuration templates

### Phase 4: CLI Demo Command
- [ ] Implement `proto demo` command
- [ ] Support demo selection (stripe, github, petstore, northwind, sakila)
- [ ] Auto-import with bundled overrides
- [ ] Generate governance report after demo
- [ ] Interactive demo mode with guided steps

### Testing & Integration
- [ ] Unit tests for seed curator
- [ ] Integration tests with Docker containers
- [ ] E2E test: demo → import → review → governance
- [ ] Validate seed manifests
- [ ] Performance: demo setup <30s

---

## Key Design Decisions

### Seed Directory Structure
```
app/seeds/
├── curator.js              # Seed loading and management
├── registry.js             # Available seed catalog
├── openapi/
│   ├── stripe/
│   │   ├── manifest.json   # Seed metadata
│   │   ├── spec.json       # OpenAPI spec
│   │   └── overrides/      # Bundled override rules
│   ├── github/
│   │   ├── manifest.json
│   │   ├── spec.json
│   │   └── overrides/
│   └── petstore/
│       ├── manifest.json
│       └── spec.json
└── databases/
    ├── northwind/
    │   ├── docker-compose.yml
    │   ├── seed.sql
    │   └── README.md
    └── sakila/
        ├── docker-compose.yml
        ├── seed.sql
        └── README.md
```

### Seed Manifest Format
```json
{
  "id": "stripe-api",
  "type": "openapi",
  "version": "1.0.0",
  "name": "Stripe API Seed",
  "description": "Stripe API with customer and payment endpoints",
  "spec_path": "./spec.json",
  "overrides_path": "./overrides",
  "tags": ["payment", "api", "stripe"],
  "metadata": {
    "protocol_count": 50,
    "pii_fields": 15,
    "override_rules": 12,
    "api_endpoints": 25
  }
}
```

### Demo Command API
```bash
# List available demos
proto demo list

# Run specific demo
proto demo run stripe

# Run with governance report
proto demo run github --with-governance

# Interactive guided demo
proto demo interactive

# Start database seed
proto demo db northwind --start
proto demo db northwind --stop
```

---

## Integration Points

### With Importers
- Pre-configured Stripe/GitHub specs load via OpenAPI importer
- Docker databases connect via Postgres importer
- Bundled overrides auto-load from seed paths
- Manifests include import configuration

### With Override Engine
- Seed-specific override rules in `seed/*/overrides/`
- Override engine recognizes seed source type
- Rule precedence: seed < community < org < project
- Seed packs validate during curator load

### With Governance Generator
- Demo command can trigger governance generation
- Seed manifests provide protocol statistics
- Demo mode includes governance review step
- Generated GOVERNANCE.md includes seed metadata

---

## Expected Outputs

### Curator API
```javascript
const { SeedCurator } = require('./seeds/curator');

const curator = new SeedCurator();

// List available seeds
const seeds = curator.listSeeds();
// [{ id: 'stripe-api', type: 'openapi', ... }]

// Load seed
const seed = await curator.loadSeed('stripe-api');
// { manifest, spec, overrides }

// Import seed
const result = await curator.importSeed('stripe-api', {
  workspace: './demo-workspace',
  includeOverrides: true
});
```

### CLI Command Output
```bash
$ proto demo run stripe

🎯 Running Stripe API Demo...

📥 Loading seed: stripe-api
   ✓ Manifest validated
   ✓ Spec loaded (127 KB)
   ✓ 12 override rules loaded

🔄 Importing protocols...
   ✓ 50 API endpoints discovered
   ✓ 15 PII fields detected
   ✓ 12 override matches applied

📊 Generating governance report...
   ✓ Dependency graph created
   ✓ PII flow analyzed
   ✓ GOVERNANCE.md generated

✅ Demo complete! Check ./demo-workspace/ for results.

Next steps:
  1. Review manifests: ls ./demo-workspace/.proto/manifests/
  2. View governance: cat ./demo-workspace/GOVERNANCE.md
  3. Explore graph: proto graph visualize
```

---

## Next Session Setup
- Scaffold SeedCurator with manifest loading and validation
- Create seed manifest structure for Stripe, GitHub, Petstore
- Build Docker Compose files for Northwind and Sakila with seed data
- Implement CLI demo command with seed selection
- Test end-to-end: demo → import → review → governance generation

---

## Documentation Requirements
When this mission is complete, you MUST update:

### 1. Update PROJECT_CONTEXT.json
- Mark seeds domain status as "complete"
- Update session_count and last_session
- Add achievements to seeds domain
- Update mission_planning section

### 2. Update AI_HANDOFF.md
- Add completed mission to accomplishments
- Set next mission (B3.1) as current focus
- Update progress tracking
- Provide handoff context for web viewer

### 3. Log session in SESSIONS.jsonl
- Add new line with session details
- Include all deliverables created
- Document key decisions made
- Record demo examples
- Set next_task for B3.1

### 4. Update missions/current.md
- Mark B2.5 complete
- Set B3.1 as active
- Update progress checklist
- Provide next session setup

### 📋 DOCUMENTATION CHECKLIST
Before considering mission complete *(B2.5 exit criteria)*:
- [ ] All code files created and tested
- [ ] PROJECT_CONTEXT.json updated
- [ ] AI_HANDOFF.md updated
- [ ] Session logged in SESSIONS.jsonl
- [ ] missions/current.md updated
- [ ] All files committed if using git

**IMPORTANT**: Mission is not complete until ALL documentation is updated

---

*Next Missions*: Week 3 Web Viewer → Semantic Protocol Dogfooding → CLI Polish

## Recent Completions

### B2.4 - GOVERNANCE.md Generator ✅
- GovernanceGenerator with SectionGenerators pattern
- Mermaid dependency and PII flow diagrams
- Six configurable sections with incremental updates
- 38 passing tests, <100ms generation
- Complete API documentation

### B2.3 - Community Overrides Engine ✅
- Override rule system with precedence (project > org > community)
- Pattern matching with confidence scoring and temporal decay
- Rule export utilities for shareable packs
- Stripe and GitHub community packs (20 rules)
- 54 passing tests, <5ms performance

### B2.2 - Validators & Diff Engine ✅
- Cross-protocol validator with 4 built-in rules
- Protocol-aware diff engine
- Breaking change detector with impact analysis
- Migration suggester with code examples
- 45 passing tests, <10ms validation

### B2.1 - ProtocolGraph Implementation ✅
- Graphology-backed graph with Tarjan's algorithm
- PII tracer and impact analyzer
- LRU caching with >95% hit ratio
- Performance: <15ms for 10k nodes
- Complete API documentation
