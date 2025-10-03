Week 1 Research Missions: Protocol-Driven Discovery MVP
Mission Overview
Research missions for Week 1 MVP implementation focusing on importers, draft/approve workflow, and CLI foundation.

###

Research Mission [R1.1]: OpenAPI to API Protocol Mapping Strategies
Mission Metadata

Session Type: Research
Estimated Tokens: 15k
AI System: Gemini
Parallel Tracks: [R1.2 Postgres Introspection, R1.3 PII Detection]
Dependencies: None (first mission)

Available Tools

vsc-mcp: For symbol-level code editing (edit_symbol, read_symbol)
sequential-thinking: For complex planning
context7: For library docs

Research Objectives

Parser Selection: Compare OpenAPI parsing libraries (performance, OAS 3.x support, $ref resolution)
Pattern Detection: How to detect pagination patterns (cursor/page/limit) from OpenAPI specs
Auth Mapping: Strategies for mapping securitySchemes to our auth types (apiKey/oauth2/hmac)
Error Extraction: Techniques for inferring typed errors from response schemas
LRO Detection: Identifying long-running operation patterns (202 status, polling endpoints)

Token Budget Allocation

Initial prompt with context: ~2k tokens
Research queries: ~3k tokens
Response space: ~15-20k tokens
Follow-up refinements: ~5k tokens

Success Criteria

 Best OpenAPI parser identified with benchmarks
 Pagination detection heuristics documented (>80% accuracy target)
 Auth mapping rules defined for common patterns
 Error type inference algorithm specified
 LRO pattern detection rules catalogued

Research Focus Areas
Parser Library Comparison

swagger-parser vs openapi-parser vs custom
$ref resolution strategies
Memory usage with large specs (Stripe ~3MB)
Validation vs permissive parsing trade-offs

Pagination Pattern Detection

Common parameter names (page, cursor, offset, limit, next_token)
Response structure patterns (has_more, next, links)
Header-based pagination (Link header RFC 5988)
GraphQL-style connections

URN Generation Strategy

Path parameter normalization
Operation ID vs path-based URNs
Version extraction from base path vs info.version
Handling path collisions

### 

Research Mission [R1.2]: Postgres Introspection for Data Protocol
Mission Metadata

Session Type: Research
Estimated Tokens: 12k
AI System: Gemini
Parallel Tracks: [R1.1 OpenAPI Mapping, R1.3 PII Detection]
Dependencies: None

Available Tools

vsc-mcp: For symbol-level code editing (edit_symbol, read_symbol)
sequential-thinking: For complex planning
context7: For library docs

Research Objectives

Schema Introspection: Optimal queries for information_schema vs pg_catalog
Sampling Strategy: Row count estimation and null-rate sampling without full scans
Type Mapping: PostgreSQL types to Data Protocol schema types
View Detection: Distinguishing views, materialized views, and tables
Performance: Read-only introspection without locking issues

Token Budget Allocation

Initial prompt with context: ~2k tokens
Research queries: ~3k tokens
Response space: ~12k tokens
Follow-up refinements: ~3k tokens

Success Criteria

 Introspection query suite optimized for performance
 Sampling algorithm that works on large tables (>1M rows)
 Type mapping table covering 95% of common types
 View vs table detection logic specified
 Read-only safety guarantees documented

Research Focus Areas
Information Schema Queries
sql-- Key tables to query
information_schema.tables
information_schema.columns
information_schema.key_column_usage
information_schema.table_constraints
information_schema.referential_constraints
Performance Considerations

LIMIT 1000 sampling vs TABLESAMPLE
pg_stats for null ratios vs manual sampling
Connection pooling for parallel introspection
Transaction isolation levels

Edge Cases

Partitioned tables
Foreign tables
Inheritance hierarchies
Custom domains and types

###

Research Mission [R1.3]: PII Detection Heuristics
Mission Metadata

Session Type: Research
Estimated Tokens: 10k
AI System: Claude
Parallel Tracks: [R1.1 OpenAPI Mapping, R1.2 Postgres Introspection]
Dependencies: None

Available Tools

vsc-mcp: For symbol-level code editing (edit_symbol, read_symbol)
sequential-thinking: For complex planning
context7: For library docs

Research Objectives

Pattern Libraries: Regex patterns for common PII (email, phone, SSN, credit cards)
Column Name Heuristics: Common naming patterns indicating PII
False Positive Reduction: Strategies to minimize incorrect PII flagging
International PII: Patterns for non-US PII (GDPR considerations)
Confidence Scoring: Multi-signal PII detection with confidence levels

Token Budget Allocation

Initial prompt with context: ~2k tokens
Research queries: ~2k tokens
Response space: ~10k tokens
Follow-up refinements: ~2k tokens

Success Criteria

 Regex patterns for 10+ PII types with accuracy metrics
 Column name dictionary with 50+ PII indicators
 False positive mitigation strategies documented
 GDPR/CCPA alignment checklist
 Confidence scoring algorithm defined

Research Focus Areas
PII Pattern Categories
yamlhigh_confidence:
  - email: name + @ pattern
  - ssn: 9-digit patterns with dashes
  - credit_card: Luhn-validated numbers
  
medium_confidence:
  - phone: Various international formats
  - address: Street patterns
  - names: First/last name combinations
  
contextual:
  - ip_address: When associated with user
  - device_id: When linkable to individual
Column Name Patterns

Direct indicators: email, ssn, phone, dob
Indirect indicators: user_, person_, customer_
Suffix patterns: _id, _number, _code
Abbreviations: fname, lname, addr

###

Research Mission [R1.4]: Draft/Review/Approve Workflow Patterns
Mission Metadata

Session Type: Research
Estimated Tokens: 8k
AI System: Claude
Parallel Tracks: [R1.5 CLI Architecture]
Dependencies: [R1.1, R1.2, R1.3] - Needs understanding of what will be reviewed

Available Tools

vsc-mcp: For symbol-level code editing (edit_symbol, read_symbol)
sequential-thinking: For complex planning
context7: For library docs

Research Objectives

State Machine Design: Review states and valid transitions
Suggestion Format: JSON-Patch vs custom change format
Partial Approval: Granular accept/reject mechanisms
Audit Trail: Review decision logging requirements
Override Persistence: Replayable corrections across imports

Token Budget Allocation

Initial prompt with context: ~2k tokens
Research queries: ~2k tokens
Response space: ~8k tokens
Follow-up refinements: ~2k tokens

Success Criteria

 State transition diagram with all paths
 JSON-Patch operations for suggestions
 Partial approval algorithm specified
 Audit log schema defined
 Override replay mechanism designed

Research Focus Areas
Review States
DISCOVERED -> IN_REVIEW -> PARTIAL -> APPROVED -> DEPLOYED
           ↘────────────→ REJECTED
           ↘────────────→ STALE (source changed)
Suggestion Categories

Schema corrections (type changes, nullability)
PII classifications (confirmed/rejected)
Pagination hints (style, parameters)
Auth corrections (type, scopes)
Relationship links (URN references)

Override Rules Format
json{
  "match": {"source_url": {"contains": "api.github.com"}},
  "patches": [{"op": "set", "path": "...", "value": "..."}],
  "confidence": 0.95,
  "rationale": "..."
}

###

Research Mission [R1.5]: CLI Architecture for Extensibility
Mission Metadata

Session Type: Research
Estimated Tokens: 10k
AI System: GPT-4
Parallel Tracks: [R1.4 Review Workflow]
Dependencies: None

Available Tools

vsc-mcp: For symbol-level code editing (edit_symbol, read_symbol)
sequential-thinking: For complex planning
context7: For library docs

Research Objectives

Command Structure: Subcommand patterns (discover, approve, generate, report)
Plugin Architecture: How to add new importers/generators without core changes
Progress Reporting: Real-time feedback during long operations
Error Recovery: Resumable operations and graceful failures
Configuration: File-based vs flag-based configuration

Token Budget Allocation

Initial prompt with context: ~2k tokens
Research queries: ~2k tokens
Response space: ~10k tokens
Follow-up refinements: ~2k tokens

Success Criteria

 Command taxonomy with all Week 1-6 commands
 Plugin registration mechanism defined
 Progress reporting patterns selected
 Error handling strategy documented
 Configuration precedence rules specified

Research Focus Areas
Command Structure
bashprotocol-discover <source> <input> [options]
protocol-review <manifest> [options]
protocol-approve <manifest> [options]
protocol-generate <type> <manifest> [options]
protocol-report <type> <manifests> [options]
Plugin Architecture
javascriptclass ImporterPlugin {
  static type = 'api|data|event';
  static accepts(source) { /* url/connection validation */ }
  async discover(source) { /* returns draft manifest */ }
}
Progress Patterns

TTY progress bars vs structured logs
Resumable operations with state files
Parallel discovery with worker threads

###

Research Mission [R1.6]: URN Resolution and Cross-Protocol Linking
Mission Metadata

Session Type: Research
Estimated Tokens: 8k
AI System: Claude
Parallel Tracks: None - Critical path for Week 2
Dependencies: [R1.1, R1.2] - Needs URN generation strategies

Available Tools

vsc-mcp: For symbol-level code editing (edit_symbol, read_symbol)
sequential-thinking: For complex planning
context7: For library docs

Research Objectives

URN Grammar: Validation rules and parser implementation
Version Compatibility: Semver range matching for URN references
Resolution Strategy: Index structure for fast lookups
Cycle Detection: Graph algorithms for dependency cycles
Broken Reference Handling: Graceful degradation patterns

Token Budget Allocation

Initial prompt with context: ~2k tokens
Research queries: ~2k tokens
Response space: ~8k tokens
Follow-up refinements: ~2k tokens

Success Criteria

 URN parser with 100% grammar coverage
 Version compatibility rules defined
 O(1) lookup index structure designed
 Tarjan's algorithm adapted for cycles
 Reference validation integrated with governance

Research Focus Areas
URN Grammar Rules
urn:proto:<kind>:<authority>/<id>[@<version>][/<subpath>]

kind: api|api.endpoint|data|event|semantic
authority: [a-z0-9-_]+
id: [a-zA-Z0-9-_./]+
version: semver
subpath: percent-encoded
Resolution Index
javascriptclass URNIndex {
  exact = new Map();     // urn -> manifest
  patterns = new Map();  // urn_pattern -> [manifests]
  versions = new Map();  // base_urn -> version_tree
}
Graph Operations

Strongly connected components for cycle detection
Topological sort for dependency order
Impact analysis via reverse edges


Research Coordination Notes
Parallel Execution Plan

Phase 1 (Parallel): R1.1, R1.2, R1.3 - Core discovery capabilities
Phase 2 (Parallel): R1.4, R1.5 - Workflow and CLI
Phase 3 (Sequential): R1.6 - URN system (needs input from others)

Hand-off Points

R1.1 → R1.6: URN generation strategies for API endpoints
R1.2 → R1.6: URN patterns for database objects
R1.3 → R1.4: PII fields needing review
R1.4 → R1.5: CLI commands for review workflow

Success Metrics

All research complete in 2 days
Build missions can start Day 3 with clear specifications
No blocking dependencies between research tracks


Research missions created: 2024-01-XX
Total estimated tokens: 73k across 6 missions
Optimal AI allocation: 2 Gemini, 2 Claude, 1 GPT-4, 1 Claude