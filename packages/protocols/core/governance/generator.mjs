/**
 * GovernanceGenerator - Automated GOVERNANCE.md generation
 *
 * Generates comprehensive governance documentation from:
 * - ProtocolGraph (dependencies, PII flow, impact analysis)
 * - Override rules (statistics, contributions, quality metrics)
 * - Manifest files (ownership, approval workflows)
 *
 * Features:
 * - Mermaid diagram generation for visualizations
 * - Multi-section markdown output
 * - Configurable section inclusion
 * - Real-time statistics from live system
 */

import fs from 'fs-extra';
import path from 'path';
import { ProtocolGraph } from '../graph/index.mjs';
import { OverrideEngine } from '../overrides/index.js';
import { EventSectionGenerators } from './event-section-generator.mjs';

/**
 * Section generators for different governance concerns
 */
class SectionGenerators {
  constructor(graph, overrideEngine, manifests) {
    this.graph = graph;
    this.overrideEngine = overrideEngine;
    this.manifests = manifests;
  }

  /**
   * Generate system overview section
   */
  generateOverview() {
    const stats = this.graph.getStats();
    const overrideStats = this.overrideEngine.getStats();
    const ruleStats = overrideStats.rules || {};
    const sourceStats = ruleStats.bySource || {};

    return `# Protocol Governance

## System Overview

This document provides governance guidelines, architectural insights, and contribution processes for the protocol ecosystem.

### System Statistics

- **Total Protocols**: ${stats.nodes}
- **Protocol Relationships**: ${stats.edges}
- **Authorities**: ${stats.authorities}
- **Override Rules**: ${ruleStats.total || 0}
- **Community Contributions**: ${sourceStats.community || 0}

### Protocol Distribution

${Object.entries(stats.nodesByKind || {})
  .map(([kind, count]) => `- **${kind}**: ${count} protocols`)
  .join('\n')}
`;
  }

  /**
   * Generate architecture section with dependency graph
   */
  generateArchitecture() {
    const stats = this.graph.getStats();
    const cycles = this.graph.detectCycles();

    let section = `## Architecture

### Protocol Dependency Graph

The following diagram shows relationships between protocols in the ecosystem:

${this.generateDependencyDiagram()}

### Dependency Analysis

- **Total Dependencies**: ${stats.edges}
- **Circular Dependencies**: ${cycles.length} ${cycles.length > 0 ? '⚠️' : '✓'}
`;

    if (cycles.length > 0) {
      section += `
**Warning**: Circular dependencies detected. These should be reviewed and potentially refactored:

${cycles.slice(0, 3).map((cycle, i) => `${i + 1}. ${cycle.join(' → ')}`).join('\n')}
`;
    }

    return section;
  }

  /**
   * Generate PII privacy section with flow analysis
   */
  generatePrivacy() {
    const piiSummary = this.graph.getPIISummary();

    let section = `## Data Privacy & PII Management

### PII Flow Analysis

The system tracks Personally Identifiable Information (PII) through protocol relationships:

${this.generatePIIFlowDiagram()}

### PII Statistics

- **PII-Containing Protocols**: ${piiSummary.totalPIIProtocols || 0}
- **PII-Exposing Endpoints**: ${piiSummary.exposingEndpoints?.length || 0}
- **PII Fields Tracked**: ${piiSummary.totalPIIFields || 0}

### PII Exposure Analysis

`;

    if (piiSummary.exposingEndpoints && piiSummary.exposingEndpoints.length > 0) {
      section += piiSummary.exposingEndpoints
        .slice(0, 5)
        .map(endpoint => `- **${endpoint.urn}**: Confidence ${(endpoint.confidence * 100).toFixed(0)}%`)
        .join('\n');
    } else {
      section += '_No PII-exposing endpoints detected._\n';
    }

    section += `

### Privacy Guidelines

1. **PII Detection**: All new protocols must be analyzed for PII exposure
2. **Confidence Threshold**: PII detections above 70% confidence require review
3. **Override Rules**: Use community overrides to enhance PII detection accuracy
4. **Regular Audits**: Quarterly PII flow analysis recommended
`;

    return section;
  }

  /**
   * Generate breaking changes section
   */
  generateBreakingChanges() {
    return `## Change Management

### Breaking Change Policy

1. **Version Constraints**: Breaking changes require major version bump
2. **Impact Analysis**: Use \`graph.impactOfChange()\` before changes
3. **Migration Period**: Minimum 90 days for deprecations
4. **Communication**: Announce breaking changes via governance channel

### Breaking Change Detection

Breaking changes are automatically detected when:
- Field removals in data protocols
- Endpoint removals in API protocols
- Type changes with incompatible schemas
- Required field additions

### Impact Assessment

Before making breaking changes, run impact analysis:

\`\`\`javascript
const { ProtocolGraph } = require('./core/graph');
const graph = new ProtocolGraph();

// Assess breaking change risk
const risk = graph.assessRisk('urn:proto:myorg:api:users:v1.0.0');
console.log(\`Downstream impact: \${risk.affectedNodes.length} protocols\`);
\`\`\`

### Migration Support

- **Dual Versioning**: Run old and new versions in parallel during migration
- **Migration Guides**: Auto-generated from protocol diffs
- **Backward Compatibility**: Maintain for at least one major version
`;
  }

  /**
   * Generate contribution guidelines section
   */
  generateContributionGuidelines() {
    const stats = this.overrideEngine.getStats();
    const ruleStats = stats.rules || {};
    const sourceStats = ruleStats.bySource || {};

    return `## Contribution Guidelines

### Override Rule Contributions

The community can contribute protocol discovery improvements through override rules.

#### Current Contributions

- **Total Community Rules**: ${sourceStats.community || 0}
- **Organization Rules**: ${sourceStats.organization || 0}
- **Project Rules**: ${sourceStats.project || 0}
- **Pending Exports**: ${stats.pending || 0}

#### Submission Process

1. **Create Rule** from detection result:
   \`\`\`javascript
   const { OverrideEngine } = require('./core/overrides');
   const engine = new OverrideEngine();

   const rule = engine.createRule(detection, 'pii', {
     author: 'your-github-username',
     description: 'Clear description of the pattern'
   });
   \`\`\`

2. **Export Rule Pack**:
   \`\`\`javascript
   engine.exportPack('my-protocol-pack', './overrides', {
     version: '1.0.0',
     description: 'Protocol-specific patterns',
     tags: ['protocol-name', 'pii']
   });
   \`\`\`

3. **Submit PR** with:
   - Rule pack in \`app/overrides/community/\`
   - Test cases demonstrating matches
   - Documentation of patterns covered

#### Rule Quality Standards

- **Confidence**: Minimum 0.85 for PII patterns, 0.90 for API patterns
- **Testing**: Include 3+ positive and 2+ negative test cases
- **Documentation**: Clear description and protocol context
- **Verification**: Prefer rules verified by 10+ users

#### Review Process

1. **Automated Checks**: Schema validation, test execution
2. **Community Review**: 2+ approvals from maintainers
3. **Quality Gate**: 90%+ test coverage, no false positives
4. **Merge**: Included in next community pack release
`;
  }

  /**
   * Generate quality metrics section
   */
  generateQualityMetrics() {
    const overrideStats = this.overrideEngine.getStats();
    const ruleStats = overrideStats.rules || {};
    const typeStats = ruleStats.byType || {};
    const cacheStats = this.graph.getCacheStats();
    const sourceStats = ruleStats.bySource || {};

    return `## Quality Metrics

### System Health

- **Graph Performance**: ${typeof cacheStats.hitRatio === 'number' ? (cacheStats.hitRatio * 100).toFixed(1) : 'N/A'}% cache hit rate
- **Override Coverage**: ${ruleStats.total || 0} rules loaded
- **Rule Freshness**: ${this._calculateRuleFreshness()}

### Override Rule Statistics

| Metric | Value |
|--------|-------|
| Total Rules | ${ruleStats.total || 0} |
| Community Rules | ${sourceStats.community || 0} |
| Organization Rules | ${sourceStats.organization || 0} |
| Project Rules | ${sourceStats.project || 0} |
| PII Patterns | ${typeStats.pii_pattern || 0} |
| API Patterns | ${typeStats.api_pattern || 0} |
| Classification Rules | ${typeStats.classification || 0} |
| Matcher Cache Size | ${overrideStats.cache?.size || 0} |

### Testing Coverage

- **Unit Tests**: All core modules require 90%+ coverage
- **Integration Tests**: Protocol graph and override integration
- **Performance Tests**: <15ms graph operations, <5ms rule matching

### Validation Rules

Active validation rules:
1. **Required Fields**: Ensure manifest completeness
2. **PII Exposure**: Detect unintentional PII in APIs
3. **Breaking Changes**: Flag incompatible modifications
4. **Deprecation Policy**: Enforce sunset timelines
`;
  }

  /**
   * Generate Mermaid dependency diagram
   */
  generateDependencyDiagram() {
    const nodes = this.graph.getAllNodes().slice(0, 20); // Limit for readability

    if (nodes.length === 0) {
      return '_No protocols in graph yet._';
    }

    let mermaid = '```mermaid\ngraph TD\n';

    // Add nodes
    nodes.forEach(urn => {
      const node = this.graph.getNode(urn);
      const label = this._formatNodeLabel(urn, node);
      const nodeId = this._sanitizeNodeId(urn);
      mermaid += `  ${nodeId}["${label}"]\n`;
    });

    // Add edges
    nodes.forEach(urn => {
      const edges = this.graph.getOutEdges(urn);
      edges.forEach(edge => {
        if (nodes.includes(edge.to)) {
          const fromId = this._sanitizeNodeId(urn);
          const toId = this._sanitizeNodeId(edge.to);
          const edgeLabel = edge.kind || 'depends_on';
          mermaid += `  ${fromId} -->|${edgeLabel}| ${toId}\n`;
        }
      });
    });

    mermaid += '```\n';
    return mermaid;
  }

  /**
   * Generate Mermaid PII flow diagram
   */
  generatePIIFlowDiagram() {
    const piiSummary = this.graph.getPIISummary();
    const endpoints = piiSummary.exposingEndpoints || [];

    if (endpoints.length === 0) {
      return '_No PII flow detected yet._';
    }

    let mermaid = '```mermaid\ngraph LR\n';

    // Show top 5 PII flows
    endpoints.slice(0, 5).forEach((endpoint, i) => {
      const endpointId = `EP${i}`;
      const label = this._formatNodeLabel(endpoint.urn, endpoint);
      const confidence = (endpoint.confidence * 100).toFixed(0);

      mermaid += `  ${endpointId}["${label}\\n${confidence}% confidence"]\n`;

      // Show PII sources (simplified)
      if (endpoint.sources && endpoint.sources.length > 0) {
        endpoint.sources.slice(0, 2).forEach((source, j) => {
          const sourceId = `S${i}_${j}`;
          const sourceLabel = this._formatNodeLabel(source.urn || source, source);
          mermaid += `  ${sourceId}["${sourceLabel}"] --> ${endpointId}\n`;
        });
      }
    });

    mermaid += '```\n';
    return mermaid;
  }

  /**
   * Helper: Format node label for diagrams
   */
  _formatNodeLabel(urn, node) {
    // URN format: urn:proto:<kind>:<authority>/<id>[@version]
    const match = urn.match(/urn:proto:([^:]+):([^/]+)\/([^@]+)(?:@(.+))?/);
    if (match) {
      const [, kind, authority, id, version] = match;
      return `${id}${version ? '@' + version : ''}`;
    }
    return urn.substring(0, 30);
  }

  /**
   * Helper: Sanitize node ID for Mermaid
   */
  _sanitizeNodeId(urn) {
    return urn.replace(/[^a-zA-Z0-9]/g, '_');
  }

  /**
   * Helper: Calculate rule freshness
   */
  _calculateRuleFreshness() {
    const rules = this.overrideEngine.getRules();
    if (rules.length === 0) return 'N/A';

    const now = Date.now();
    const ages = rules.map(rule => {
      const created = new Date(rule.metadata.created).getTime();
      return (now - created) / (1000 * 60 * 60 * 24); // days
    });

    const avgAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;
    return `${avgAge.toFixed(0)} days average age`;
  }
}

/**
 * Main governance generator
 */
class GovernanceGenerator {
  constructor(options = {}) {
    this.graph = options.graph || new ProtocolGraph();
    this.overrideEngine = options.overrideEngine || new OverrideEngine();
    this.manifests = options.manifests || [];
    this.generators = new SectionGenerators(
      this.graph,
      this.overrideEngine,
      this.manifests
    );
    this.eventGenerators = new EventSectionGenerators(
      this.graph,
      this.overrideEngine,
      this.manifests
    );
  }

  /**
   * Generate complete GOVERNANCE.md
   */
  async generate(options = {}) {
    const {
      sections = ['all'],
      includeDiagrams = true,
      includePIIFlow = true,
      includeMetrics = true
    } = options;

    const shouldInclude = (section) => {
      return sections.includes('all') || sections.includes(section);
    };

    let content = '';

    // Header with generation timestamp
    content += `<!-- Auto-generated by GovernanceGenerator on ${new Date().toISOString()} -->\n\n`;

    // Overview (always included)
    if (shouldInclude('overview')) {
      content += this.generators.generateOverview() + '\n\n';
    }

    // Architecture with diagrams
    if (shouldInclude('architecture') && includeDiagrams) {
      content += this.generators.generateArchitecture() + '\n\n';
    }

    // Privacy and PII
    if (shouldInclude('privacy') && includePIIFlow) {
      content += this.generators.generatePrivacy() + '\n\n';
    }

    // Breaking changes
    if (shouldInclude('changes')) {
      content += this.generators.generateBreakingChanges() + '\n\n';
    }

    // Contribution guidelines
    if (shouldInclude('contributions')) {
      content += this.generators.generateContributionGuidelines() + '\n\n';
    }

    // Quality metrics
    if (shouldInclude('metrics') && includeMetrics) {
      content += this.generators.generateQualityMetrics() + '\n\n';
    }

    // Event governance sections
    if (shouldInclude('events') || shouldInclude('all')) {
      content += this.eventGenerators.generateEventDeliveryOverview() + '\n\n';
      content += this.eventGenerators.generatePIIEventRetention() + '\n\n';
      content += this.eventGenerators.generateDLQAnalysis() + '\n\n';
      content += this.eventGenerators.generateEventFanoutAnalysis() + '\n\n';
      content += this.eventGenerators.generateReplayRiskAssessment() + '\n\n';

      // Event flow diagram
      if (includeDiagrams) {
        content += `### Event Flow Visualization\n\n`;
        content += this.eventGenerators.generateEventFlowDiagram() + '\n\n';
      }
    }

    // Footer
    content += this._generateFooter();

    return content;
  }

  enforceBreakingChangePolicy(change) {
    return {
      approved: false,
      reason: `breaking change detected: ${change.description || change.type}`,
      requiresApproval: true,
      riskLevel: 'high',
      requiresMigration: change.migrationRequired !== false,
      change
    };
  }

  requireApproval(change) {
    const required = change.severity === 'high' || change.impact === 'high';
    const approvers = required ? ['governance@ossp.local', 'architecture@ossp.local'] : [];
    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    return {
      required,
      approvers,
      deadline,
      rationale: required ? 'High risk change requires governance approval' : 'No approval required'
    };
  }

  trackViolation(violation) {
    const violationId = `${violation.protocolUrn || 'unknown'}:${Date.now()}`;

    return {
      tracked: true,
      violationId,
      escalationRequired: violation.severity !== 'low',
      notificationSent: true
    };
  }

  /**
   * Generate and write to file
   */
  async generateToFile(outputPath, options = {}) {
    const content = await this.generate(options);
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, content, 'utf8');
    return { path: outputPath, size: content.length };
  }

  /**
   * Update existing GOVERNANCE.md
   */
  async update(existingPath, options = {}) {
    let existing = '';
    if (await fs.pathExists(existingPath)) {
      existing = await fs.readFile(existingPath, 'utf8');
    }

    const generated = await this.generate(options);

    // Preserve any custom sections (those between <!-- CUSTOM_START --> and <!-- CUSTOM_END -->)
    const customSections = this._extractCustomSections(existing);

    let final = generated;
    if (customSections.length > 0) {
      final += '\n\n## Custom Sections\n\n' + customSections.join('\n\n');
    }

    await fs.writeFile(existingPath, final, 'utf8');
    return { path: existingPath, size: final.length, customSections: customSections.length };
  }

  /**
   * Extract custom sections from existing file
   */
  _extractCustomSections(content) {
    const sections = [];
    const regex = /<!-- CUSTOM_START -->([\s\S]*?)<!-- CUSTOM_END -->/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      sections.push(match[1].trim());
    }

    return sections;
  }

  /**
   * Generate footer with links
   */
  _generateFooter() {
    return `---

## Additional Resources

- [Override System Documentation](../docs/overrides.md)
- [Protocol Graph API](../docs/protocol-graph.md)
- [Testing Guidelines](../docs/testing.md)

## Governance Updates

This document is auto-generated from the live system state. To update:

\`\`\`bash
# Regenerate governance documentation
node -e "
(async () => {
const { GovernanceGenerator } = await import('./app/core/governance/index.mjs');
const gen = new GovernanceGenerator();
await gen.generateToFile('./GOVERNANCE.md');
console.log('Updated');
})();
"
\`\`\`

---

*Last updated: ${new Date().toISOString().split('T')[0]}*
`;
  }
}

export {
  GovernanceGenerator,
  SectionGenerators
};
