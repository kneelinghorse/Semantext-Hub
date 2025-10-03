# Validators & Diff Engine API

Cross-protocol validation and manifest comparison utilities for the Protocol-Driven Discovery system.

## Overview

The validators and diff engine provide:

- **Cross-protocol validation** - Validate URN references, version compatibility, and semantic consistency across protocol manifests
- **Manifest diffing** - Compare protocol manifests to detect structural and semantic changes
- **Breaking change detection** - Identify and classify breaking changes with downstream impact analysis
- **Migration suggestions** - Generate actionable migration guides with code examples and effort estimates

## Components

### CrossValidator

Validates manifests against a set of pluggable rules using the ProtocolGraph.

#### Basic Usage

```javascript
const { CrossValidator } = require('./validation/cross-validator');
const { ProtocolGraph } = require('./core/graph/protocol-graph');

// Initialize with graph
const graph = new ProtocolGraph();
const validator = new CrossValidator(graph);

// Validate a manifest
const result = validator.validate(manifest);

if (!result.valid) {
  console.log('Validation errors:', result.issues.errors);
}
```

#### Validation Result Structure

```javascript
{
  valid: boolean,
  totalIssues: number,
  issues: {
    errors: [
      {
        rule: 'urn_references',
        type: 'urn_resolution',
        severity: 'error',
        message: 'Unresolved URN reference: urn:...',
        field: 'dependencies.depends_on[0]',
        value: 'urn:...',
        suggestion: 'Ensure the referenced manifest is loaded...'
      }
    ],
    warnings: [...],
    info: [...]
  }
}
```

#### Built-in Validation Rules

1. **urn_references** - Validates URN format and resolution
   - Checks URN syntax compliance
   - Verifies all referenced URNs can be resolved in the graph
   - Severity: ERROR for invalid format, WARNING for unresolved

2. **version_compatibility** - Validates version semantics
   - Detects major version increases (breaking changes)
   - Checks semantic version compliance
   - Severity: INFO

3. **circular_dependencies** - Detects dependency cycles
   - Uses Tarjan's algorithm via ProtocolGraph
   - Reports all manifests in the cycle
   - Severity: WARNING

4. **pii_exposure** - Validates PII data flow
   - Traces PII from data sources to public endpoints
   - Reports exposure risks
   - Severity: WARNING

#### Custom Validation Rules

```javascript
// Register a custom rule
validator.registerRule('custom_check', (manifest, graph) => {
  const issues = [];

  // Perform validation logic
  if (someCondition) {
    issues.push({
      message: 'Custom validation failed',
      field: 'some.field',
      value: manifest.some.field,
      severity: 'warning',
      suggestion: 'Fix this issue by...'
    });
  }

  return issues;
}, {
  type: 'custom',
  severity: 'warning',
  enabled: true
});
```

#### Validation Options

```javascript
// Run specific rules only
const result = validator.validate(manifest, {
  rules: ['urn_references', 'version_compatibility']
});
```

---

### DiffEngine

Compares two versions of a manifest to detect changes.

#### Basic Usage

```javascript
const { DiffEngine } = require('./diff/engine');

const engine = new DiffEngine();
const diffReport = engine.diff(oldManifest, newManifest);

console.log(`Breaking changes: ${diffReport.summary.breaking}`);
console.log(`Compatible changes: ${diffReport.summary.compatible}`);
```

#### Diff Report Structure

```javascript
{
  summary: {
    totalChanges: 15,
    breaking: 3,
    nonBreaking: 5,
    compatible: 5,
    internal: 2,
    hasBreakingChanges: true,
    changesByType: {
      added: 5,
      removed: 3,
      modified: 7
    }
  },
  changes: {
    breaking: [
      {
        type: 'removed',
        impact: 'breaking',
        path: 'catalog.endpoints[POST /users]',
        description: 'Endpoint removed: POST /users',
        oldValue: { method: 'POST', path: '/users', ... },
        newValue: null
      }
    ],
    nonBreaking: [...],
    compatible: [...],
    internal: [...]
  },
  oldVersion: '1.0.0',
  newVersion: '2.0.0',
  timestamp: '2025-09-30T...'
}
```

#### Change Types

- **added** - New element added
- **removed** - Element removed
- **modified** - Element changed
- **renamed** - Element renamed (when detection enabled)
- **moved** - Element moved (when detection enabled)

#### Impact Levels

- **breaking** - Requires consumer code changes
- **non_breaking** - May require attention but doesn't break existing code
- **compatible** - Backward compatible addition
- **internal** - Internal/metadata change

#### Protocol-Specific Diffing

The diff engine handles protocol-specific semantics:

**API Protocol:**
- Endpoint additions (compatible) vs removals (breaking)
- Request/response schema changes
- Authentication requirement changes
- Required field additions (breaking)

**Data Protocol:**
- Table additions (compatible) vs removals (breaking)
- Column type changes (breaking)
- Nullable → non-nullable (breaking)
- Non-nullable column additions (breaking)

**Event Protocol:**
- Event additions (compatible) vs removals (breaking)
- Event schema changes

#### Engine Options

```javascript
const engine = new DiffEngine({
  includeMetadata: true,    // Include metadata changes
  detectMoves: true,        // Detect renamed/moved elements
  semanticDiff: true        // Use semantic comparison
});
```

---

### BreakingChangeDetector

Analyzes diff reports to classify breaking changes and assess downstream impact.

#### Basic Usage

```javascript
const { BreakingChangeDetector } = require('./diff/breaking-detector');

const detector = new BreakingChangeDetector(protocolGraph);
const analysis = detector.detectBreakingChanges(diffReport, manifestURN);

console.log(`Risk score: ${analysis.riskScore}/100`);
console.log(`Affected manifests: ${analysis.downstreamImpact.totalAffected}`);
```

#### Analysis Result

```javascript
{
  hasBreakingChanges: true,
  breakingChanges: [
    {
      ...change,
      category: 'removed_endpoint',
      severity: 'high'
    }
  ],
  downstreamImpact: {
    affectedManifests: ['urn:proto:api:...', ...],
    totalAffected: 15,
    criticalPath: true
  },
  riskScore: 85,
  recommendation: {
    level: 'critical',
    message: 'High-risk breaking changes detected...',
    actions: [
      'Implement versioning strategy',
      'Provide migration documentation',
      'Set up deprecation warnings',
      ...
    ]
  }
}
```

#### Breaking Change Categories

- **removed_endpoint** - API endpoint removed
- **removed_field** - Field/column removed
- **type_change** - Field type changed
- **required_field_added** - New required field
- **auth_change** - Authentication requirement changed
- **contract_violation** - Other contract violations
- **semantic_change** - Semantic meaning changed

#### Risk Scoring

Risk score (0-100) calculated from:
- Number of breaking changes (0-30 points)
- Severity of changes (0-40 points)
- Downstream impact (0-30 points)

Recommendation levels:
- **critical** (80-100): Extensive planning required
- **warning** (50-79): Careful migration planning
- **caution** (20-49): Standard communication
- **info** (0-19): Low risk

#### Migration Hints

```javascript
const hints = detector.generateMigrationHints(analysis.breakingChanges);

hints.forEach(hint => {
  console.log(hint.suggestion);
  console.log(hint.code);
});
```

---

### MigrationSuggester

Generates migration guides with actionable steps and code examples.

#### Basic Usage

```javascript
const { MigrationSuggester } = require('./diff/migration-suggester');

const suggester = new MigrationSuggester({
  includeCodeExamples: true,
  targetLanguage: 'javascript',
  minConfidence: 0.7
});

const guide = suggester.generateMigrationGuide(diffReport, breakingAnalysis);
```

#### Migration Guide Structure

```javascript
{
  version: {
    from: '1.0.0',
    to: '2.0.0'
  },
  summary: { /* diff summary */ },
  strategy: {
    approach: 'phased',
    description: 'High-risk changes require careful migration',
    phases: [
      {
        phase: 1,
        name: 'Preparation',
        tasks: [
          'Review all breaking changes',
          'Identify affected code paths',
          ...
        ]
      },
      ...
    ]
  },
  effort: {
    estimatedHours: 12.5,
    complexity: 'medium',
    confidence: 0.7,
    note: 'Estimate based on typical scenarios...'
  },
  suggestions: [
    {
      change: 'Endpoint removed: POST /users',
      path: 'catalog.endpoints[POST /users]',
      type: 'removed',
      impact: 'breaking',
      priority: 90,
      confidence: 0.8,
      pattern: 'endpoint_replacement',
      steps: [
        'Identify all API calls to the removed endpoint',
        'Find replacement endpoint in new API version',
        'Update request/response handling if schema changed',
        ...
      ],
      codeExamples: [
        {
          language: 'javascript',
          description: 'Update API call',
          before: 'await fetch(\'/users\', { method: \'POST\', ... })',
          after: '// TODO: Replace with new endpoint'
        }
      ]
    },
    ...
  ]
}
```

#### Migration Patterns

- **endpoint_replacement** - Replace removed/changed endpoints
- **field_mapping** - Map old fields to new fields
- **type_conversion** - Convert between data types
- **auth_update** - Update authentication
- **schema_evolution** - Handle schema changes
- **pagination_change** - Handle pagination changes

#### Migration Strategies

**Phased** (high risk):
1. Preparation - Review and plan
2. Implementation - Code changes with feature flags
3. Deployment - Gradual rollout with monitoring

**Direct** (medium risk):
1. Update & Test - Apply changes and verify

**Simple** (low risk):
1. Update - Safe version bump

#### Effort Estimation

Calculated based on:
- Number and severity of changes
- Change patterns (schema evolution adds 1.5x multiplier)
- Complexity: low (<8h), medium (8-16h), high (>16h)

#### Suggester Options

```javascript
const suggester = new MigrationSuggester({
  includeCodeExamples: true,   // Include code snippets
  targetLanguage: 'javascript', // Target language for examples
  minConfidence: 0.5            // Minimum confidence threshold
});
```

---

## Integration Examples

### Complete Validation + Diff Workflow

```javascript
const { ProtocolGraph } = require('./core/graph/protocol-graph');
const { CrossValidator } = require('./validation/cross-validator');
const { DiffEngine } = require('./diff/engine');
const { BreakingChangeDetector } = require('./diff/breaking-detector');
const { MigrationSuggester } = require('./diff/migration-suggester');

// 1. Build graph with all manifests
const graph = new ProtocolGraph();
manifests.forEach(m => {
  graph.addNode(m.metadata.urn, m.metadata.kind, m);
});

// 2. Validate new manifest
const validator = new CrossValidator(graph);
const validationResult = validator.validate(newManifest);

if (!validationResult.valid) {
  console.error('Validation failed:', validationResult.issues.errors);
  process.exit(1);
}

// 3. Compare with previous version
const diffEngine = new DiffEngine();
const diffReport = diffEngine.diff(oldManifest, newManifest);

if (!diffReport.summary.hasBreakingChanges) {
  console.log('No breaking changes - safe to deploy');
  return;
}

// 4. Analyze breaking changes
const detector = new BreakingChangeDetector(graph);
const analysis = detector.detectBreakingChanges(diffReport, newManifest.metadata.urn);

console.log(`Risk score: ${analysis.riskScore}/100`);
console.log(`Recommendation: ${analysis.recommendation.level}`);

// 5. Generate migration guide
const suggester = new MigrationSuggester({ includeCodeExamples: true });
const guide = suggester.generateMigrationGuide(diffReport, analysis);

// Output migration guide
console.log(`\nMigration from ${guide.version.from} to ${guide.version.to}`);
console.log(`Strategy: ${guide.strategy.approach}`);
console.log(`Estimated effort: ${guide.effort.estimatedHours}h (${guide.effort.complexity})`);
console.log(`\nSuggestions:`);
guide.suggestions.forEach((s, i) => {
  console.log(`${i + 1}. [Priority ${s.priority}] ${s.change}`);
  s.steps.forEach(step => console.log(`   - ${step}`));
});
```

### CLI Integration Example

The `review` and `approve` commands now orchestrate the complete validation pipeline:

- Build a `ProtocolGraph` from neighbouring manifests on disk
- Run structural validation, cross-protocol rules, and cache-aware graph checks
- Generate manifest diffs against the latest approved version (when available)
- Classify breaking changes and provide migration guidance with effort estimates

```bash
# Review draft manifest with full validation + diff reporting
node app/cli/index.js review artifacts/api-manifest.draft.json

# Approve manifest (will fail if blocking issues remain)
node app/cli/index.js approve artifacts/api-manifest.draft.json
```

---

## Performance Targets

- Cross-validation: <10ms per rule on 1k-node graph
- Diff generation: <50ms for typical manifest
- Breaking change analysis: <20ms with graph lookups
- Migration guide generation: <100ms

All validators leverage ProtocolGraph caching for repeated operations.

---

## Testing

Run validator tests:

```bash
npm test -- tests/validation
npm test -- tests/diff
```

Performance benchmarks:

```bash
npm run test:performance
```

---

## Next Steps

- B2.3: Community Overrides Engine (rule precedence)
- B2.4: GOVERNANCE.md Generator (uses validators + diff)
- B2.5: Curated Seeds System (validation in seed scenarios)
