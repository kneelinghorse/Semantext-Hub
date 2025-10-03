# Week 2 Build Missions

## Mission Order (Technical Dependencies)
1. **B2.1**: ProtocolGraph Implementation (Days 1-2) - Foundation
2. **B2.2**: Validators & Diff Engine (Day 3) - Extends validation
3. **B2.3**: Community Overrides Engine (Day 4) - Independent feature
4. **B2.4**: GOVERNANCE.md Generator (Days 4-5) - Needs graph + validators
5. **B2.5**: Curated Seeds System (Day 5) - Integration demo

---

# Mission B2.1: ProtocolGraph Implementation
*Week 2, Days 1-2 - Core Infrastructure*

## Mission Metadata
- **Session Type**: Build
- **Estimated Tokens**: 25k
- **Complexity**: High
- **Dependencies**: B1.1-B1.4 complete, URN format established
- **Enables**: B2.2 (Validators), B2.4 (GOVERNANCE.md), all future graph operations

## Available Tools
- vsc-mcp: For symbol-level code editing (edit_symbol, read_symbol)
- sequential-thinking: For complex planning
- context7: For library docs

## Token Budget Planning
```yaml
context_load:
  project_context: 2k
  research_findings: 3k
  existing_protocols: 3k
  
generation_budget:
  implementation: 12k
  tests: 5k
  documentation: 3k
  
validation_reserve: 5k
total_estimated: 33k
```

## Research Foundation Applied
- **SPRINT_02_RESEARCH_R2.1.md**: Graphology for graph operations, Tarjan's O(V+E) cycle detection
- **URN format**: `urn:proto:<kind>:<authority>/<id>[@<version>]`
- **Performance**: <10ms for 1000 nodes, LRU caching for repeated queries
- **Memory**: CSR format + typed arrays for efficiency

## Implementation Scope

### Core Deliverable
```javascript
// core/graph/protocol-graph.js
class ProtocolGraph {
  constructor() {
    this.nodes = new Map();      // URN -> {kind, manifest}
    this.edges = new Map();      // URN -> [{kind, to, metadata}]
    this.index = new Map();      // Various indices for fast lookup
    this.cache = new LRUCache(); // Traversal results cache
  }
  
  // Core operations
  addNode(urn, kind, manifest) {}
  addEdge(from, kind, to, metadata = {}) {}
  removeNode(urn) {}
  removeEdge(from, to) {}
  
  // URN operations
  resolveURN(urn) {}                    // Handle version ranges
  parseURN(urnString) {}                // Extract components
  normalizeURN(urn) {}                  // Canonicalize
  
  // Graph traversal
  traverse(startUrn, filter, options) {} // DFS/BFS with options
  findPaths(from, to, maxDepth = 10) {}  // All paths between nodes
  detectCycles() {}                       // Tarjan's algorithm
  
  // PII tracing
  tracePIIFlow(endpointUrn) {
    // Returns: [{source, field, path, confidence}]
    // Path shows how PII flows from source to endpoint
  }
  
  // Impact analysis  
  impactOfChange(urn) {
    // Returns: {direct: [], transitive: [], breaking: bool, severity}
    // Shows what breaks if this URN changes
  }
  
  // Performance optimized queries
  getNodesByKind(kind) {}               // Use index
  getEdgesByKind(kind) {}               // Use index
  getConnectedComponents() {}           // Find isolated subgraphs
  
  // Serialization
  toJSON() {}                           // For persistence
  fromJSON(json) {}                     // For loading
  
  // Statistics
  getStats() {
    return {
      nodes: this.nodes.size,
      edges: this.edges.size,
      cycles: this.detectCycles().length,
      components: this.getConnectedComponents().length,
      avgDegree: this.calculateAverageDegree()
    };
  }
}

// Edge kinds enum
const EdgeKind = {
  DEPENDS_ON: 'depends_on',
  PRODUCES: 'produces',
  CONSUMES: 'consumes',
  READS_FROM: 'reads_from',
  WRITES_TO: 'writes_to',
  EXPOSES: 'exposes',
  DERIVES_FROM: 'derives_from'
};

// Node kinds enum  
const NodeKind = {
  API: 'api',
  API_ENDPOINT: 'api.endpoint',
  DATA: 'data',
  EVENT: 'event',
  SEMANTIC: 'semantic'
};
```

### Performance Requirements
```javascript
// Performance tests
describe('ProtocolGraph Performance', () => {
  it('handles 1000 nodes in <10ms', async () => {
    const graph = createLargeGraph(1000);
    const start = performance.now();
    graph.tracePIIFlow('urn:proto:api:test/endpoint@1.0.0');
    expect(performance.now() - start).toBeLessThan(10);
  });
  
  it('handles 10000 nodes in <100ms', async () => {
    const graph = createLargeGraph(10000);
    const start = performance.now();
    graph.detectCycles();
    expect(performance.now() - start).toBeLessThan(100);
  });
});
```

## Success Criteria
- ✅ URN resolution with version ranges works
- ✅ Tarjan's cycle detection implemented
- ✅ PII flow tracing returns complete paths
- ✅ Performance: <10ms for 1000 nodes
- ✅ Cache improves repeated queries >50%
- ✅ Memory usage <100MB for 10k nodes

## Deliverables Checklist
- [ ] File: `core/graph/protocol-graph.js`
- [ ] File: `core/graph/tarjan.js`
- [ ] File: `core/graph/pii-tracer.js`
- [ ] File: `core/graph/impact-analyzer.js`
- [ ] Tests: `tests/graph/protocol-graph.test.js`
- [ ] Tests: `tests/graph/performance.test.js`
- [ ] Docs: `docs/graph-api.md`

## Handoff Context
```json
{
  "completed": ["ProtocolGraph class", "URN resolution", "PII tracing"],
  "interfaces": ["addNode", "addEdge", "tracePIIFlow", "impactOfChange"],
  "assumptions": ["URNs are immutable", "Graph fits in memory"],
  "performance": {"1k_nodes": "8ms", "10k_nodes": "87ms"},
  "next_mission": "B2.2 - Validators & Diff Engine"
}
```

---

# Mission B2.2: Validators & Diff Engine
*Week 2, Day 3 - Quality Assurance*

## Mission Metadata
- **Session Type**: Build
- **Estimated Tokens**: 20k
- **Complexity**: Medium
- **Dependencies**: B2.1 (ProtocolGraph)
- **Enables**: B2.4 (GOVERNANCE.md), breaking change detection

## Available Tools
- vsc-mcp: For symbol-level code editing (edit_symbol, read_symbol)
- sequential-thinking: For complex planning
- context7: For library docs

## Token Budget Planning
```yaml
context_load:
  project_context: 2k
  protocol_graph: 2k
  existing_validators: 2k
  
generation_budget:
  implementation: 10k
  tests: 3k
  
validation_reserve: 3k
total_estimated: 22k
```

## Implementation Scope

### Core Deliverable
```javascript
// validation/cross-validator.js
class CrossProtocolValidator {
  constructor(graph) {
    this.graph = graph;
    this.validators = new Map();
    
    // Register protocol-specific validators
    this.registerValidator('api', new APIValidator());
    this.registerValidator('data', new DataValidator());
    this.registerValidator('event', new EventValidator());
  }
  
  async validateAll(manifests) {
    const results = {
      valid: true,
      findings: [],
      crossProtocolIssues: []
    };
    
    // Individual validation
    for (const manifest of manifests) {
      const validation = await this.validate(manifest);
      results.findings.push(...validation.findings);
      results.valid = results.valid && validation.valid;
    }
    
    // Cross-protocol validation
    const crossIssues = await this.validateCrossProtocol(manifests);
    results.crossProtocolIssues = crossIssues;
    
    return results;
  }
  
  async validateCrossProtocol(manifests) {
    const issues = [];
    
    // Check URN references resolve
    for (const manifest of manifests) {
      const refs = this.extractURNReferences(manifest);
      for (const ref of refs) {
        if (!this.graph.resolveURN(ref)) {
          issues.push({
            severity: 'error',
            type: 'unresolved_reference',
            manifest: manifest.urn,
            reference: ref,
            message: `URN reference ${ref} does not resolve`
          });
        }
      }
    }
    
    // Check compatibility between connected protocols
    const edges = this.graph.edges;
    for (const [from, connections] of edges) {
      for (const conn of connections) {
        const compatibility = this.checkCompatibility(from, conn.to);
        if (!compatibility.compatible) {
          issues.push({
            severity: 'warning',
            type: 'incompatible_versions',
            from: from,
            to: conn.to,
            reason: compatibility.reason
          });
        }
      }
    }
    
    return issues;
  }
}

// diff/engine.js
class DiffEngine {
  diff(manifestA, manifestB) {
    const normalized = {
      a: this.normalize(manifestA),
      b: this.normalize(manifestB)
    };
    
    const changes = this.structuralDiff(normalized.a, normalized.b);
    const breaking = this.detectBreakingChanges(changes, manifestA, manifestB);
    const migrations = this.suggestMigrations(breaking);
    
    return {
      changes: changes,
      breaking: breaking,
      migrations: migrations,
      compatible: breaking.length === 0,
      risk: this.assessRisk(breaking)
    };
  }
  
  detectBreakingChanges(changes, oldManifest, newManifest) {
    const breaking = [];
    
    for (const change of changes) {
      // API: Method or path change
      if (change.path.match(/interface\.endpoints\.\d+\.(method|path)/)) {
        breaking.push({
          ...change,
          type: 'endpoint_signature',
          severity: 'critical',
          migration: 'Update all clients'
        });
      }
      
      // Data: Column removal or type change
      if (change.path.match(/schema\.fields\.\w+/) && change.to === undefined) {
        breaking.push({
          ...change,
          type: 'column_removed',
          severity: 'critical',
          migration: 'Add migration to handle missing column'
        });
      }
      
      // Event: Required field added
      if (change.path.match(/schema\.required/) && change.to?.length > change.from?.length) {
        breaking.push({
          ...change,
          type: 'required_field_added',
          severity: 'high',
          migration: 'Update producers to include new field'
        });
      }
    }
    
    return breaking;
  }
}
```

## Success Criteria
- ✅ Cross-protocol validation works
- ✅ Breaking changes detected accurately
- ✅ Migration suggestions helpful
- ✅ URN reference validation
- ✅ Compatibility checking between versions

## Deliverables Checklist
- [ ] File: `validation/cross-validator.js`
- [ ] File: `diff/engine.js`
- [ ] File: `diff/breaking-detector.js`
- [ ] File: `diff/migration-suggester.js`
- [ ] Tests: `tests/validation/cross-validator.test.js`
- [ ] Tests: `tests/diff/engine.test.js`

## Handoff Context
```json
{
  "completed": ["CrossProtocolValidator", "DiffEngine", "Breaking change detection"],
  "next_mission": "B2.3 - Community Overrides Engine"
}
```

---

# Mission B2.3: Community Overrides Engine
*Week 2, Day 4 - Ecosystem Feature*

## Mission Metadata
- **Session Type**: Build
- **Estimated Tokens**: 20k
- **Complexity**: Medium
- **Dependencies**: B1.4 (Approve workflow)
- **Enables**: B2.5 (Seeds with overrides), community contributions

## Available Tools
- vsc-mcp: For symbol-level code editing (edit_symbol, read_symbol)
- sequential-thinking: For complex planning
- context7: For library docs

## Token Budget Planning
```yaml
context_load:
  project_context: 2k
  existing_overrides: 2k
  
generation_budget:
  implementation: 12k
  tests: 3k
  
validation_reserve: 3k
total_estimated: 22k
```

## Implementation Scope

### Core Deliverable
```javascript
// overrides/engine.js
class OverrideEngine {
  constructor() {
    this.rules = new Map();
    this.cache = new Map();
  }
  
  async loadRules(sources) {
    // Load from: community -> org -> project
    // Later rules override earlier ones
    const rules = [];
    
    for (const source of sources) {
      const loaded = await this.loadFromSource(source);
      rules.push(...loaded);
    }
    
    this.compileRules(rules);
  }
  
  async applyRules(manifest, sourceUrl) {
    const applicable = this.findApplicableRules(manifest, sourceUrl);
    const patches = [];
    
    for (const rule of applicable) {
      if (this.evaluateMatch(rule.match, manifest, sourceUrl)) {
        // Calculate confidence with temporal decay
        const confidence = this.calculateConfidence(rule);
        
        if (confidence >= rule.minConfidence) {
          patches.push(...rule.patches.map(p => ({
            ...p,
            source: rule.id,
            confidence: confidence
          })));
        }
      }
    }
    
    // Apply patches in order
    return this.applyPatches(manifest, patches);
  }
  
  calculateConfidence(rule) {
    const base = rule.confidence || 0.5;
    const verificationBoost = Math.min(rule.verifiedCount / 100, 0.3);
    const ageDecay = this.calculateAgeDecay(rule.createdAt);
    
    return Math.min(1.0, base + verificationBoost * ageDecay);
  }
  
  exportRules(manifest, patches) {
    // Generate shareable rule from applied patches
    return {
      version: '1.0.0',
      id: crypto.randomUUID(),
      match: this.inferMatch(manifest),
      patches: patches,
      confidence: 0.8,
      rationale: 'User-approved corrections',
      contributedBy: process.env.USER,
      createdAt: new Date().toISOString()
    };
  }
}

// Rule format
const ruleSchema = {
  version: '1.0.0',
  rules: [{
    id: 'github-api-oauth',
    match: {
      type: 'api',
      source_url: { contains: 'api.github.com' }
    },
    patches: [
      { op: 'set', path: '/interface/authentication/type', value: 'oauth2' },
      { op: 'add', path: '/interface/authentication/scopes', value: ['repo', 'user'] }
    ],
    confidence: 0.95,
    minConfidence: 0.7,
    rationale: 'GitHub API always uses OAuth2',
    contributedBy: 'user@example.com',
    verifiedCount: 42,
    createdAt: '2024-01-01T00:00:00Z'
  }]
};
```

## Success Criteria
- ✅ Load rules from multiple sources
- ✅ Apply rules with confidence scoring
- ✅ Export user corrections as rules
- ✅ Temporal decay reduces old rule confidence
- ✅ Community -> org -> project precedence

## Deliverables Checklist
- [ ] File: `overrides/engine.js`
- [ ] File: `overrides/matcher.js`
- [ ] File: `overrides/confidence.js`
- [ ] File: `data/community-overrides.json`
- [ ] Tests: `tests/overrides/engine.test.js`

## Handoff Context
```json
{
  "completed": ["OverrideEngine", "Confidence scoring", "Rule export"],
  "next_mission": "B2.4 - GOVERNANCE.md Generator"
}
```

---

# Mission B2.4: GOVERNANCE.md Generator
*Week 2, Days 4-5 - Comprehensive Analysis*

## Mission Metadata
- **Session Type**: Build
- **Estimated Tokens**: 30k
- **Complexity**: High
- **Dependencies**: B2.1 (ProtocolGraph), B2.2 (Validators)
- **Enables**: Quality governance reporting

## Available Tools
- vsc-mcp: For symbol-level code editing (edit_symbol, read_symbol)
- sequential-thinking: For complex planning
- context7: For library docs

## Token Budget Planning
```yaml
context_load:
  project_context: 2k
  protocol_graph: 3k
  research_findings: 2k
  
generation_budget:
  implementation: 15k
  templates: 5k
  tests: 3k
  
validation_reserve: 5k
total_estimated: 35k
```

## Research Foundation Applied
- **Risk scoring**: PII (40%), Delivery (30%), Compliance (30%)
- **Priority matrix**: Critical (immediate), High (1wk), Medium (1mo)
- **Mermaid diagrams**: Visual PII flow representation
- **Effort estimates**: Include with all recommendations

## Implementation Scope

### Core Deliverable
```javascript
// governance/reporter.js
class GovernanceReporter {
  constructor(graph, manifests) {
    this.graph = graph;
    this.manifests = manifests;
    this.findings = [];
  }
  
  async generateReport() {
    const sections = [
      this.generateExecutiveSummary(),
      this.generatePIIAnalysis(),
      this.generateSecurityPosture(),
      this.generateDeliveryResilience(),
      this.generateComplianceStatus(),
      this.generateRecommendations(),
      this.generateProvenance()
    ];
    
    return this.renderMarkdown(sections);
  }
  
  generatePIIAnalysis() {
    const piiFlows = [];
    
    // Find all API endpoints
    const endpoints = this.graph.getNodesByKind('api.endpoint');
    
    for (const endpoint of endpoints) {
      const flow = this.graph.tracePIIFlow(endpoint.urn);
      if (flow.length > 0) {
        piiFlows.push({
          endpoint: endpoint.urn,
          method: endpoint.manifest.method,
          path: endpoint.manifest.path,
          sources: flow,
          riskLevel: this.calculatePIIRisk(flow)
        });
      }
    }
    
    // Generate visual flow with Mermaid
    const diagram = this.generatePIIFlowDiagram(piiFlows);
    
    return {
      title: 'PII Exposure Analysis',
      stats: {
        totalPIIFields: this.countTotalPIIFields(),
        exposedEndpoints: piiFlows.length,
        criticalExposures: piiFlows.filter(f => f.riskLevel === 'critical').length
      },
      diagram: diagram,
      details: piiFlows
    };
  }
  
  generatePIIFlowDiagram(flows) {
    // Generate Mermaid diagram
    const mermaid = ['graph LR'];
    
    for (const flow of flows) {
      for (const source of flow.sources) {
        const sourceId = source.dataset.replace(/[^a-zA-Z0-9]/g, '_');
        const endpointId = flow.endpoint.replace(/[^a-zA-Z0-9]/g, '_');
        
        mermaid.push(`  ${sourceId}[${source.dataset}.${source.field}]`);
        mermaid.push(`  ${sourceId} -->|PII| ${endpointId}`);
        mermaid.push(`  ${endpointId}[${flow.method} ${flow.path}]`);
        
        if (flow.riskLevel === 'critical') {
          mermaid.push(`  ${endpointId}:::critical`);
        }
      }
    }
    
    mermaid.push('  classDef critical fill:#f96,stroke:#f00,stroke-width:4px');
    
    return mermaid.join('\n');
  }
  
  calculateRiskScore(findings) {
    let score = 0;
    
    // PII exposure (40% weight)
    const piiScore = findings.pii.exposureCount * 10;
    const piiPublic = findings.pii.publicEndpoints * 50;
    score += (piiScore + piiPublic) * 0.4;
    
    // Delivery reliability (30% weight)
    const dlqMissing = findings.delivery.missingDLQ * 20;
    const retryMissing = findings.delivery.noRetryPolicy * 10;
    score += (dlqMissing + retryMissing) * 0.3;
    
    // Compliance (30% weight)
    const noRetention = findings.compliance.noRetentionPolicy * 15;
    const noAudit = findings.compliance.missingAuditLog * 15;
    score += (noRetention + noAudit) * 0.3;
    
    return {
      score: Math.min(100, Math.round(score)),
      level: score > 70 ? 'critical' : score > 40 ? 'high' : 'medium',
      breakdown: {
        pii: Math.round((piiScore + piiPublic) * 0.4),
        delivery: Math.round((dlqMissing + retryMissing) * 0.3),
        compliance: Math.round((noRetention + noAudit) * 0.3)
      }
    };
  }
  
  generateRecommendations() {
    const recommendations = [];
    
    for (const finding of this.findings) {
      const rec = {
        priority: finding.severity,
        issue: finding.description,
        recommendation: this.getRecommendation(finding.type),
        effort: this.getEffortEstimate(finding.type),
        example: this.getExample(finding.type),
        references: this.getReferences(finding.type)
      };
      
      recommendations.push(rec);
    }
    
    // Sort by priority and effort
    recommendations.sort((a, b) => {
      const priorityOrder = {'critical': 0, 'high': 1, 'medium': 2};
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return a.effort.hours - b.effort.hours;
    });
    
    return recommendations;
  }
}

// governance/risk-scorer.js
class RiskScorer {
  static scoringWeights = {
    pii_exposure: 0.4,
    delivery_reliability: 0.3,
    compliance: 0.3
  };
  
  static findingTemplates = {
    pii_in_logs: {
      severity: 'critical',
      recommendation: 'Implement log scrubbing before shipping logs',
      effort: { hours: 2, complexity: 'low' },
      example: 'Use winston-privacy or pino-redact',
      references: ['https://github.com/example/log-scrubbing']
    },
    missing_dlq: {
      severity: 'high',
      recommendation: 'Add dead letter queue for failed messages',
      effort: { hours: 1, complexity: 'low' },
      example: 'AWS SQS DLQ or Kafka dead letter topic',
      references: ['https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html']
    },
    no_encryption: {
      severity: 'critical',
      recommendation: 'Enable encryption at rest for PII data',
      effort: { hours: 4, complexity: 'medium' },
      example: 'PostgreSQL TDE or application-level encryption',
      references: ['https://www.postgresql.org/docs/current/encryption-options.html']
    }
  };
}
```

### Markdown Template
```markdown
# GOVERNANCE.md Template

## Executive Summary
- **Overall Risk Score**: {score}/100 ({level})
- **Critical Findings**: {count}
- **Estimated Remediation**: {totalHours} hours
- **Compliance Status**: {compliancePercentage}%

## 🔴 Critical Issues
{criticalFindings}

## 🟡 High Priority
{highFindings}

## PII Data Flow Analysis

### Visual Flow Diagram
\```mermaid
{piiFlowDiagram}
\```

### Detailed PII Exposure
{piiDetails}

## Security Posture
{securityAnalysis}

## Delivery & Resilience
{deliveryAnalysis}

## Compliance Status
### GDPR Compliance: {gdprScore}%
{gdprDetails}

### CCPA Compliance: {ccpaScore}%
{ccpaDetails}

## Actionable Recommendations
{sortedRecommendations}

## Provenance
{sourceDetails}
```

## Success Criteria
- ✅ Generates comprehensive GOVERNANCE.md in <1s
- ✅ PII flow diagram renders correctly in Mermaid
- ✅ Risk scores are accurate and justified
- ✅ Recommendations include effort estimates
- ✅ Supports GDPR, CCPA, HIPAA frameworks
- ✅ Markdown is clean and readable

## Deliverables Checklist
- [ ] File: `governance/reporter.js`
- [ ] File: `governance/risk-scorer.js`
- [ ] File: `governance/compliance-mapper.js`
- [ ] File: `governance/templates/governance.md`
- [ ] Tests: `tests/governance/reporter.test.js`
- [ ] Example: `examples/GOVERNANCE.example.md`

## Handoff Context
```json
{
  "completed": ["GovernanceReporter", "RiskScorer", "Mermaid diagrams"],
  "next_mission": "B2.5 - Curated Seeds System"
}
```

---

# Mission B2.5: Curated Seeds System
*Week 2, Day 5 - Integration Demo*

## Mission Metadata
- **Session Type**: Build
- **Estimated Tokens**: 15k
- **Complexity**: Low
- **Dependencies**: B1.1-B1.4 complete, B2.3 (Overrides)
- **Enables**: End-to-end demo, testing entire workflow

## Token Budget Planning
```yaml
context_load:
  project_context: 2k
  existing_importers: 2k
  
generation_budget:
  implementation: 8k
  seeds_data: 3k
  
validation_reserve: 2k
total_estimated: 17k
```

## Implementation Scope

### Core Deliverable
```javascript
// seeds/curator.js
class SeedCurator {
  constructor() {
    this.seeds = {
      apis: {
        stripe: {
          url: 'https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json',
          overrides: 'seeds/overrides/stripe.json',
          description: 'Stripe Payment API',
          tags: ['payments', 'financial']
        },
        github: {
          url: 'https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json',
          overrides: 'seeds/overrides/github.json',
          description: 'GitHub REST API',
          tags: ['vcs', 'collaboration']
        },
        petstore: {
          url: 'https://petstore.swagger.io/v2/swagger.json',
          overrides: null,
          description: 'OpenAPI Example',
          tags: ['example', 'simple']
        }
      },
      databases: {
        northwind: {
          docker: 'seeds/docker/postgres-northwind.yml',
          connection: 'postgresql://demo:demo@localhost:5432/northwind',
          description: 'Classic Northwind traders database',
          tags: ['example', 'commerce']
        },
        sakila: {
          docker: 'seeds/docker/postgres-sakila.yml',
          connection: 'postgresql://demo:demo@localhost:5432/sakila',
          description: 'DVD rental database',
          tags: ['example', 'rental']
        }
      },
      events: {
        ecommerce: {
          url: 'seeds/asyncapi/ecommerce-events.yml',
          description: 'E-commerce event system',
          tags: ['example', 'commerce', 'events']
        }
      }
    };
  }
  
  async runDemo(type = 'all') {
    console.log('🚀 Protocol Discovery Demo\n');
    
    // Start Docker databases if needed
    if (type === 'all' || type === 'database') {
      await this.startDatabases();
    }
    
    // Import all seeds
    const results = [];
    
    // APIs
    if (type === 'all' || type === 'api') {
      for (const [name, seed] of Object.entries(this.seeds.apis)) {
        console.log(`📦 Importing ${name} API...`);
        const manifest = await this.importAPI(seed);
        results.push({ type: 'api', name, manifest });
      }
    }
    
    // Databases
    if (type === 'all' || type === 'database') {
      for (const [name, seed] of Object.entries(this.seeds.databases)) {
        console.log(`🗄️ Importing ${name} database...`);
        const manifest = await this.importDatabase(seed);
        results.push({ type: 'data', name, manifest });
      }
    }
    
    // Generate governance
    console.log('\n📊 Generating GOVERNANCE.md...');
    await this.generateGovernance(results);
    
    console.log('\n✅ Demo complete! Check artifacts/ directory');
    
    return results;
  }
  
  async startDatabases() {
    // docker-compose up for test databases
    for (const [name, seed] of Object.entries(this.seeds.databases)) {
      if (seed.docker) {
        await exec(`docker-compose -f ${seed.docker} up -d`);
      }
    }
    
    // Wait for databases to be ready
    await this.waitForDatabases();
  }
}

// CLI integration
// protocol-demo seeds [--type api|database|events|all]
```

### Docker Compose Files
```yaml
# seeds/docker/postgres-northwind.yml
version: '3.8'
services:
  postgres-northwind:
    image: postgres:14
    environment:
      POSTGRES_USER: demo
      POSTGRES_PASSWORD: demo
      POSTGRES_DB: northwind
    ports:
      - "5432:5432"
    volumes:
      - ./data/northwind.sql:/docker-entrypoint-initdb.d/init.sql
```

## Success Criteria
- ✅ One command runs complete demo
- ✅ Docker databases start automatically
- ✅ All seeds import successfully
- ✅ GOVERNANCE.md shows real findings
- ✅ Works on fresh machine

## Deliverables Checklist
- [ ] File: `seeds/curator.js`
- [ ] File: `seeds/overrides/stripe.json`
- [ ] File: `seeds/overrides/github.json`
- [ ] File: `seeds/docker/postgres-northwind.yml`
- [ ] File: `seeds/docker/postgres-sakila.yml`
- [ ] File: `seeds/data/northwind.sql`
- [ ] File: `cli/commands/demo.js`
- [ ] Tests: `tests/seeds/curator.test.js`
- [ ] Docs: `docs/demo-guide.md`

## Handoff Context
```json
{
  "completed": ["SeedCurator", "Demo command", "Docker setup", "Curated overrides"],
  "week_2_complete": true
}
```

---

## Week 2 Sprint Summary

### Mission Dependencies
```mermaid
graph TD
    B2.1[B2.1: ProtocolGraph] --> B2.2[B2.2: Validators]
    B2.1 --> B2.4[B2.4: GOVERNANCE.md]
    B2.2 --> B2.4
    B2.3[B2.3: Overrides] --> B2.5[B2.5: Seeds]
    B2.4 --> B2.5
    B2.5 --> Complete[Week 2 Complete]
```

### Success Metrics
- ✅ B2.1: Graph handles 1000 nodes in <10ms
- ✅ B2.2: Breaking changes detected accurately
- ✅ B2.3: Community overrides work with confidence scoring
- ✅ B2.4: GOVERNANCE.md with visual PII flows
- ✅ B2.5: Demo runs in one command

### Total Token Budget
- Research: Complete (SPRINT_02_RESEARCH_R2.1.md)
- Build Missions: ~120k tokens
- Validation: ~25k tokens
- Total Week 2: ~145k tokens

### Handoff for Week 3
By end of Week 2, we have:
- ✅ Complete graph-based analysis
- ✅ Comprehensive governance reporting with Mermaid diagrams
- ✅ Community contribution system
- ✅ Working demo with real APIs/DBs
- ✅ Foundation for Week 3 viewer with Semantic Protocol
