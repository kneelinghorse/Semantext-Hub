# Mission Backlog - Protocol-Driven Discovery
*Current and future missions*

## Week 1: MVP Development ✅ COMPLETE
*Focus: Working import → approve → generate flow*

### Completed
- [x] **Mission B1.1**: OpenAPI Importer ✅
  - Pattern detection (pagination, LRO, rate limits)
  - x-* extension preservation (35+ types)
  - Confidence scoring for all heuristics
  - Comprehensive test coverage

- [x] **Mission B1.2**: Postgres Importer ✅
  - Multi-signal PII detection (>90% accuracy)
  - Schema introspection with foreign keys/indexes
  - pg_stats performance metadata
  - Adaptive sampling (100-1000 rows)

- [x] **Mission B1.3**: CLI Framework & Commands ✅
  - Basic command structure (discover, review, approve)
  - Progress indicators for >2s operations
  - CI detection and output formatting

- [x] **Mission B1.4**: Draft/Approve Workflow ✅
  - State machine implementation
  - Suggestions engine
  - Override persistence
  - JSON-Patch operations

- [x] **Mission B1.5**: End-to-End Testing ✅
  - OpenAPI workflow validated
  - Postgres workflow validated
  - 39 total tests passing

**Week 1 Summary:**
- 27 files created
- 39 tests passing (5 e2e + 34 workflow units)
- Complete discover → review → approve pipeline
- All performance targets met

---

## Week 2: Governance & Protocol Integration ✅ COMPLETE
*Focus: Graph-based analysis, governance reporting, quality tooling*

### Completed
- [x] **Mission B2.1**: ProtocolGraph Implementation ✅
  - Graphology-backed graph with URN indexing
  - Tarjan's algorithm for cycle detection O(V+E)
  - PII flow tracing with confidence propagation
  - Impact analysis with downstream/upstream scoring
  - LRU-backed caching (>95% hit ratio after 100 iterations)
  - Performance: <15ms for 10k nodes
  - Research: missions/research/SPRINT_02_RESEARCH_R2.1.md

- [x] **Mission B2.2**: Validators & Diff Engine ✅
  - Cross-protocol validation with 4 built-in rules
  - Protocol-specific diffing (API/Data/Event/Semantic)
  - Breaking change detector with risk scoring (0-100)
  - Migration suggester with code examples
  - 45 passing tests

- [x] **Mission B2.3**: Community Overrides Engine ✅
  - Override rule system with precedence (project > org > community)
  - Pattern matching with confidence scoring
  - Temporal decay (100%/90%/80%/70% by age)
  - Enhanced PII and API pattern detectors
  - Stripe (12 rules) and GitHub (8 rules) packs
  - 54 passing tests, <5ms matching

- [x] **Mission B2.4**: GOVERNANCE.md Generator ✅
  - Auto-generates from ProtocolGraph + OverrideEngine
  - Mermaid dependency graphs with cycle detection
  - PII flow diagrams with confidence annotations
  - Six configurable sections
  - Preserves custom sections on update
  - 38 passing tests, <100ms generation

- [x] **Mission B2.5**: Curated Seeds System ✅
  - SeedCurator API with manifest validation
  - 3 OpenAPI seeds (Stripe, GitHub, Petstore)
  - 2 PostgreSQL seeds (Northwind, Sakila) with Docker
  - CLI demo commands (list, run, db)
  - Interactive guided mode
  - 31 passing tests

**Week 2 Summary:**
- 200+ tests passing across all components
- Complete governance infrastructure delivered
- Graph performance validated (10k nodes)
- Community override system with <5ms matching
- Zero-config demo system (one-command)
- All Week 2 deliverables production-ready

---

## Week 3: Web Viewer & Semantic Protocol ✅ COMPLETE
*Focus: Visual exploration with semantic self-documentation*

### Completed
- [x] **Mission B3.1**: Express Server Foundation ✅
  - Viewer API: `/api/health`, `/api/manifests`, `/api/manifest/:filename`
  - Security: path validation, rate limiting (100 req/min)
  - CLI serve command with graceful shutdown
  - 29 passing tests (server, routes, security)
  - Performance: <100ms manifest serving
  - Research: missions/research/SPRINT_03_RESEARCH_R3.1.md

- [x] **Mission B3.2**: React Viewer with Tabs ✅
  - 5-tab interface (Health, Manifests, Validation, Graph, Governance)
  - Syntax highlighting (Prism.js)
  - Accessible keyboard navigation
  - API integration with Express
  - Vitest component tests passing

- [x] **Mission B3.3**: Semantic Protocol Dogfooding ✅
  - SemanticRegistry + useSemanticPanel hook
  - All UI panels self-documented
  - Debug toggle (Ctrl/Cmd+Shift+D)
  - Semantic coverage across viewer
  - Registry snapshot export

- [x] **Mission B3.4**: Alt-Click Inspection UI ✅
  - Alt-click activation on semantic elements
  - 60fps overlay with element highlighting
  - Keyboard shortcuts (Alt+Click, Ctrl+Shift+I, Escape)
  - Registry context display
  - 32 passing tests (activation, positioning, accessibility)

**Week 3 Summary:**
- 61 tests passing (29 server + 32 client)
- Complete web viewer with semantic self-documentation
- All performance targets met (<2s load, 60fps overlay)
- Viewer demonstrates its own architecture
- Production-ready for demos

---

## Week 4: AsyncAPI & Event Streaming ✅ COMPLETE
*Focus: Event-driven architecture support*

### Completed
- [x] **Mission B4.1**: AsyncAPI Importer ✅
  - Parse AsyncAPI 2.x/3.x specs with @asyncapi/parser
  - Multi-signal protocol binding detection (Kafka, AMQP, MQTT)
  - Recursive PII detection in event payloads
  - Channel-based URN generation
  - Event Protocol manifest creation
  - Performance: <3s for 50-channel spec
  - Research: missions/research/SPRINT_04_RESEARCH_R4.1.md

- [x] **Mission B4.2**: Event-Specific Patterns ✅
  - DLQ configuration detection
  - Retry policy inference
  - Message ordering analysis
  - Event fanout detection
  - Schema evolution assessment

- [x] **Mission B4.3**: Event Governance ✅
  - PII retention policy checks
  - DLQ configuration validation
  - Replay risk assessment
  - Fanout multiplication warnings
  - Event flow Mermaid diagrams

- [x] **Mission B4.4**: Consumer Generation ✅
  - TypeScript consumer skeletons
  - Kafka/AMQP/MQTT clients
  - PII governance hooks
  - Error handling and DLQ routing
  - Test scaffolds

**Week 4 Summary:**
- 25+ files created (importers, pattern detectors, generators)
- 468+ tests passing (AsyncAPI + patterns + governance + generators)
- Complete event streaming pipeline (AsyncAPI → governance → consumers)
- Multi-tier binding detection (95-99% reliability)
- Three-tier PII detection with confidence scoring
- Pattern-driven governance with compliance warnings
- TypeScript consumer generation for Kafka/AMQP/MQTT
- All performance targets met

---

## Week 5: Production Readiness (CURRENT SPRINT)
*Focus: Caching, CI/GitHub Actions, packaging, security redaction, templates*

### Research Foundation
- [x] R5.1: GitHub Actions for Node.js/TypeScript Protocol Management
  - File: missions/research/SPRINT_05_RESEARCH_R5.1.md
  - Covers: actions/setup-node@v4, tsx execution, caching strategies, PR automation, credential handling
- [x] R5.2: npm Packaging & CLI Distribution
  - File: missions/research/SPRINT_05_RESEARCH_R5.2.md
  - Covers: Publishing scoped packages, cross-platform compatibility, scaffolding architecture, esbuild, npx optimization
- [x] R5.3: Security & Redaction
  - File: missions/research/SPRINT_05_RESEARCH_R5.3.md
  - Covers: Secret detection (Gitleaks, TruffleHog), PII redaction (Presidio), credential patterns, logging safety
- [x] R5.4: Catalog Indexing & Templates
  - File: missions/research/SPRINT_05_RESEARCH_R5.4.md
  - Covers: Index schema, query strategies, Handlebars templates, validation, URN lookups

### Current Mission
- [ ] **Mission B5.1**: Catalog Index & Query Engine (CURRENT - see current.md)
  - URNCatalogIndex with O(1) URN lookups
  - Secondary indexes (namespace, tags, owner, PII)
  - Dependency graph with topological sort
  - Query methods (by URN, tag, governance)
  - Cycle detection with Tarjan's algorithm
  - Performance: <1ms URN lookup, <10ms tag queries
  - 35k tokens estimated
  - Research: R5.4

### Phase 1: Core Infrastructure (Queued - Can Run in Parallel)
- [ ] **Mission B5.2**: Security Redaction Utilities
  - Secret detection (Gitleaks patterns + entropy)
  - Credential patterns (AWS, GitHub, Stripe, SSH, JWT)
  - Manifest field-based redaction
  - Connection string safety
  - Safe logger configuration (Pino)
  - Pre-commit hook integration
  - 38k tokens estimated
  - Research: R5.3

- [ ] **Mission B5.3**: Template System & Generators
  - Handlebars template engine setup
  - Protocol templates (Event, Data, API) × (JS, TS)
  - Helper functions (dasherize, camelCase, pascalCase, buildUrn)
  - Shared partials (governance, metadata, dependencies)
  - Template validation (syntax, variables, output)
  - 32k tokens estimated
  - Research: R5.4

### Phase 2: CLI Scaffolding (Queued)
- [ ] **Mission B5.4**: CLI Scaffolding Tool (create-protocol-demo)
  - Interactive prompts flow (prompts library)
  - Template copying and project generation
  - package.json merging
  - Git initialization (optional)
  - Cross-platform compatibility (bin, shebang)
  - Esbuild bundling (<500KB)
  - 36k tokens estimated
  - Dependencies: B5.3
  - Research: R5.2

### Phase 3: CI/CD Automation (Queued)
- [ ] **Mission B5.5**: GitHub Actions Workflow (Discovery & Validation)
  - Nightly scheduled workflow (2 AM UTC)
  - Manual trigger with cache bypass
  - Discovery → Validation → Report pipeline
  - TypeScript execution via tsx
  - Intelligent caching (dependencies, discovery results)
  - Artifact publishing (v4)
  - Workflow summaries
  - Redaction integration
  - 34k tokens estimated
  - Dependencies: B5.1, B5.2
  - Research: R5.1

- [ ] **Mission B5.6**: PR Automation & Governance Reporting
  - Conditional PR creation (only if changes)
  - peter-evans/create-pull-request@v7
  - Rich PR body (governance report, metrics, diff)
  - Apply changes to repository
  - Labels and reviewers assignment
  - Branch cleanup after merge
  - 30k tokens estimated
  - Dependencies: B5.5
  - Research: R5.1

### Phase 4: Distribution (Queued)
- [ ] **Mission B5.7**: npm Package Configuration & Distribution
  - package.json setup (bin, files, exports)
  - Publishing workflow (GitHub Actions)
  - Cross-platform testing matrix
  - npm provenance (--provenance flag)
  - README and documentation
  - prepublishOnly automation
  - 28k tokens estimated
  - Dependencies: B5.4
  - Research: R5.2

**Week 5 Mission Dependencies:**
```
B5.1 (Index) ────┐
                 ├──> B5.5 (Actions) ──> B5.6 (PR Automation)
B5.2 (Security) ─┘

B5.3 (Templates) ──> B5.4 (CLI) ──> B5.7 (npm Publishing)
```

**Total Estimated Tokens**: ~238k across 7 missions  
**Estimated Time**: 7-10 sessions (1 per mission)  
**Parallel Execution**: Phase 1 can run concurrently (B5.1, B5.2, B5.3)

---

## Week 6: Launch Preparation
*Focus: Documentation, demos, community*

### Critical for Launch
- [ ] **Mission B6.1**: Documentation Site
  - Quick start guide
  - API reference
  - Cookbook examples
  - Troubleshooting guide
  - Architecture overview

- [ ] **Mission B6.2**: Demo Materials
  - Animated GIF for README
  - Video walkthrough
  - Live demo site
  - Example repositories
  - Before/after comparisons

- [ ] **Mission B6.3**: Community Setup
  - GitHub issue templates
  - Contributing guide
  - Code of conduct
  - Discord/Slack channel
  - First good issues

- [ ] **Mission B6.4**: Launch Content
  - Blog post draft
  - Hacker News post
  - Dev.to article
  - Twitter thread
  - Reddit posts

- [ ] **Mission B6.5**: Adoption Tracking
  - Analytics integration
  - Success metrics dashboard
  - User feedback collection
  - Error reporting
  - Usage patterns analysis

---

## Future Enhancements (Post-Launch)

### Data Sources
- [ ] MySQL/MariaDB support
- [ ] MongoDB introspection  
- [ ] GraphQL schema import
- [ ] Protobuf/gRPC support
- [ ] Snowflake/BigQuery integration

### Advanced Features
- [ ] APIs.guru bulk import
- [ ] VS Code extension
- [ ] Schema evolution tracking
- [ ] Contract testing generation
- [ ] Dependency update automation

### Governance Expansion
- [ ] SOC2 compliance mapping
- [ ] Cost estimation for PII
- [ ] Multi-region analysis
- [ ] Data lineage visualization
- [ ] Automated remediation

### Community Features
- [ ] Override marketplace
- [ ] Template sharing
- [ ] Success story showcase
- [ ] Integration gallery
- [ ] Learning mode

---

## Research Completed

### Week 1 Research
- [x] R1.1: OpenAPI pattern detection (pagination, LRO, rate limits)
- [x] R1.2: Postgres PII detection (multi-signal approach)
- [x] R1.6: CLI design patterns (response times, CI detection)
- [x] R1.4: Workflow state machines (draft/approve transitions)

### Week 2 Research
- [x] R2.1: Graph performance optimization (Graphology, Tarjan's, CSR)
  - File: missions/research/SPRINT_02_RESEARCH_R2.1.md
  - Covers: Graph libraries, cycle detection, visualization, caching

### Week 3 Research
- [x] R3.1: UI Inspection Patterns & Semantic Panel Architecture
  - File: missions/research/SPRINT_03_RESEARCH_R3.1.md
  - Covers: Inspection mode patterns, semantic architecture, Mermaid integration, syntax highlighting, Express server patterns

### Week 4 Research
- [x] R4.1: AsyncAPI Import & Event Protocol Mapping
  - File: missions/research/SPRINT_04_RESEARCH_R4.1.md
  - Covers: AsyncAPI parser selection, protocol binding detection, event PII detection, URN generation, consumer generation

---

## Success Metrics Tracking

### Week 1 ✅ COMPLETE
- ✅ OpenAPI importer handles 35+ x-* extensions
- ✅ PII detection >90% accuracy
- ✅ CLI startup <200ms
- ✅ Draft → approve workflow functional
- ✅ 39 tests passing

### Week 2 ✅ COMPLETE
- ✅ Graph handles 10k nodes in <15ms
- ✅ PII flow tracing with confidence propagation
- ✅ Governance report generation <100ms
- ✅ Breaking change detection with risk scoring
- ✅ Demo runs in one command (5 pre-configured seeds)
- ✅ 200+ tests passing

### Week 3 ✅ COMPLETE
- ✅ Server startup <500ms, manifest load <100ms
- ✅ Viewer loads in <2s, tab switch <50ms
- ✅ Semantic manifests for 10+ panels
- ✅ Inspection overlay at 60fps
- ✅ 61 tests passing

### Week 4 ✅ COMPLETE
- ✅ AsyncAPI 2.x/3.x parsing <200ms
- ✅ Protocol binding detection >85% confidence (achieved 95-99%)
- ✅ Event PII detection >85% accuracy
- ✅ Consumer generation <2s for 20 consumers
- ✅ End-to-end pipeline <3s for 50-channel spec
- ✅ 468+ tests passing

### Week 5 (Current)
- [ ] URN catalog index <1ms lookups
- [ ] Secret detection with <5% false positives
- [ ] CI workflow completes <5 minutes
- [ ] npm package installs cleanly cross-platform
- [ ] Performance targets all met

### Week 6
- [ ] 200+ GitHub stars
- [ ] 100+ npm downloads
- [ ] First external contributor

---

*Backlog updated: October 4, 2025*
*Sprint: Week 5 Active - Production Readiness*
*Current Mission: B5.1 Catalog Index & Query Engine*
*Next Planning: End of Week 5*
