# Protocol-Driven Discovery

**Version 0.1.0** - Discover and convert existing contracts (OpenAPI, Postgres, AsyncAPI) into unified protocol manifests with governance-first approach.

## 🎯 Project Status

- **Phase**: Week 1 MVP Development
- **Current Mission**: B1.4 - Draft/Approve Workflow
- **Completed Missions**:
  - ✅ B1.1 - OpenAPI Importer
  - ✅ B1.2 - Postgres Importer
  - ✅ B1.3 - Basic CLI Framework

## 📋 Overview

Protocol-Driven Discovery automatically converts existing API specifications and database schemas into standardized protocol manifests. It provides:

- **Automated Import**: Convert OpenAPI specs and Postgres databases to manifests
- **Pattern Detection**: Identify pagination, long-running operations, rate limits
- **PII Detection**: Multi-signal detection with >90% accuracy
- **CLI Tools**: Command-line interface for discovery, review, and approval
- **Governance-First**: Built-in workflow for review and approval

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd OSS_Protocols

# Install dependencies
npm install
```

### Basic Usage

```bash
# Discover from OpenAPI URL
node app/cli/index.js discover https://petstore.swagger.io/v2/swagger.json

# Discover from OpenAPI file
node app/cli/index.js discover api ./openapi.yaml

# Discover from Postgres database
node app/cli/index.js discover postgresql://user:pass@localhost/db

# With options
node app/cli/index.js discover api ./spec.json --output ./output --format yaml

# Review draft manifest (stub - B1.4)
node app/cli/index.js review artifacts/api-manifest.draft.json

# Approve manifest (stub - B1.4)
node app/cli/index.js approve artifacts/api-manifest.draft.json
```

### CLI Commands

- `discover [type] <source>` - Discover contracts and generate draft manifests
- `review <manifest>` - Review draft manifest (coming in B1.4)
- `approve <manifest>` - Approve draft manifest (coming in B1.4)
- `--help` - Show help
- `--version` - Show version

## 🏗️ Architecture

```
/app
├── cli/                    # CLI framework (B1.3)
│   ├── index.js           # Main entry point
│   ├── commands/          # Command implementations
│   └── utils/             # Progress, output, CI detection
├── importers/             # Import engines
│   ├── openapi/           # OpenAPI importer (B1.1)
│   └── postgres/          # Postgres importer (B1.2)
├── src/                   # Core protocols
│   ├── api_protocol_v_0_3_0.js
│   ├── data_protocol_v_1_1_1.js
│   ├── event_protocol_v_1_1_1.js
│   └── semantic-protocol.js
└── tests/                 # Test suites
    ├── importers/
    └── cli/
```

## ✨ Features

### OpenAPI Importer (B1.1)
- ✅ Parse OpenAPI 3.x specs with fallback for malformed specs
- ✅ Pattern detection (pagination, long-running operations, rate limits)
- ✅ Preserve 35+ x-* extensions
- ✅ Generate deterministic URNs
- ✅ Confidence scoring for heuristics
- ✅ Provenance metadata with spec hashing

### Postgres Importer (B1.2)
- ✅ Read-only connection with timeout
- ✅ Multi-signal PII detection (>90% accuracy)
- ✅ Schema introspection (tables, columns, constraints)
- ✅ Foreign key and index extraction
- ✅ Performance metadata from pg_stats
- ✅ Adaptive sampling (100-1000 rows based on table size)
- ✅ URN generation for tables and columns

### CLI Framework (B1.3)
- ✅ Commander.js-based command structure
- ✅ Auto-detect source types (URL, file, connection string)
- ✅ CI-aware output (JSON-only, no spinners in CI)
- ✅ Progress indicators for operations >2s
- ✅ Pretty terminal output with colors
- ✅ Artifacts directory for all output
- ✅ Error handling with actionable messages

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- app/tests/importers/openapi.test.js
npm test -- app/tests/importers/postgres.test.js
npm test -- app/tests/cli/commands.test.js

# Watch mode
npm run test:watch
```

## 📊 Performance Targets

- CLI startup: <200ms for help/version
- Import operation: <2s for typical API
- PII detection: <5s for 100 tables
- Graph traversal: <10ms for 1000 nodes
- Memory usage: <100MB for large specs

## 🗺️ Roadmap

### Week 1: MVP (Current)
- ✅ **B1.1**: OpenAPI Importer
- ✅ **B1.2**: Postgres Importer
- ✅ **B1.3**: Basic CLI Framework
- ⏳ **B1.4**: Draft/Approve Workflow (Next)

### Week 2: Governance
- **B2.1**: Manifest Validation
- **B2.2**: Diff Engine
- **B2.3**: Governance Reports
- **B2.4**: Risk Scoring

### Week 3: Web Viewer
- **B3.1**: Static Site Generator
- **B3.2**: Interactive Viewer
- **B3.3**: Query Interface
- **B3.4**: Semantic Protocol Dogfooding

### Future
- AsyncAPI importer
- MySQL importer
- GraphQL introspection
- APIs.guru catalog integration

## 🔧 Development

### Project Structure

- `app/` - All build artifacts and code
- `missions/` - Mission definitions and tracking
- `PROJECT_CONTEXT.json` - AI context and domain state
- `AI_HANDOFF.md` - Session handoff documentation
- `SESSIONS.jsonl` - Session history log

### Code Style

- Functional programming style
- Minimal dependencies
- Comprehensive JSDoc comments
- Error messages with actionable fixes
- Confidence scores for all heuristics

### Key Patterns

- **Multi-signal detection**: Combine multiple signals for higher accuracy
- **Confidence scoring**: Make heuristics transparent and tunable
- **Graceful degradation**: Error manifests for failed imports
- **Provenance tracking**: Hash-based verification for imports
- **URN generation**: Stable identifiers across imports

## 📚 Documentation

- [Project Context](PROJECT_CONTEXT.json) - Complete domain state
- [AI Handoff](AI_HANDOFF.md) - Session handoff guide
- [Current Mission](missions/current.md) - Active mission details
- [Session History](SESSIONS.jsonl) - Complete session log

## 🎯 Mission System

This project uses a mission-driven workflow with CMOS (Context Management & Orchestration System):

- Each mission has clear deliverables and success criteria
- All changes are tracked in PROJECT_CONTEXT.json
- Session history maintained in SESSIONS.jsonl
- AI handoff documentation ensures continuity

## 🤝 Contributing

This is currently a personal project for protocol-driven contract discovery. The mission system and documentation practices can serve as examples for other projects.

## 📝 License

Private project - License TBD

---

**Built with CMOS v1.0 - Context Management & Orchestration System**

*Last Updated: 2025-09-30*
*Mission B1.3 Completed ✅*
