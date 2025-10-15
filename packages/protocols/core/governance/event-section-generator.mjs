/**
 * Event Governance Section Generator
 *
 * Generates event-specific governance sections for GOVERNANCE.md:
 * - Event delivery overview (transport, retention, guarantees)
 * - PII event retention analysis (compliance risks)
 * - DLQ configuration validation (pattern-based)
 * - Event fanout risk assessment (multiplication warnings)
 * - Replay risk assessment (log compaction, retention)
 * - Event flow Mermaid diagrams
 */

/**
 * Event-specific section generators
 */
class EventSectionGenerators {
  constructor(graph, overrideEngine, manifests) {
    this.graph = graph;
    this.overrideEngine = overrideEngine;
    this.manifests = manifests;
  }

  /**
   * Get event manifests from protocol graph
   */
  _getEventManifests() {
    return this.manifests.filter(m => m.protocol === 'event');
  }

  /**
   * Generate event delivery overview section
   */
  generateEventDeliveryOverview() {
    const events = this._getEventManifests();

    if (events.length === 0) {
      return `## Event Streaming & Delivery

_No event protocols detected yet._`;
    }

    // Aggregate transport statistics
    const transportStats = {};
    const retentionStats = {
      infinite: 0,
      longTerm: 0,    // > 30 days
      mediumTerm: 0,  // 7-30 days
      shortTerm: 0,   // < 7 days
      unknown: 0
    };

    events.forEach(event => {
      const transport = event.delivery?.contract?.transport || 'unknown';
      transportStats[transport] = (transportStats[transport] || 0) + 1;

      // Retention analysis
      const retention = event.delivery?.contract?.retention;
      if (!retention) {
        retentionStats.unknown++;
      } else if (retention === 'infinite' || retention === -1) {
        retentionStats.infinite++;
      } else {
        const days = this._parseRetentionDays(retention);
        if (days > 30) retentionStats.longTerm++;
        else if (days >= 7) retentionStats.mediumTerm++;
        else retentionStats.shortTerm++;
      }
    });

    let section = `## Event Streaming & Delivery

### Delivery Overview

The event streaming architecture consists of ${events.length} event stream(s) across ${Object.keys(transportStats).length} transport protocol(s).

### Transport Distribution

| Transport | Count | Percentage |
|-----------|-------|------------|
`;

    Object.entries(transportStats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([transport, count]) => {
        const pct = ((count / events.length) * 100).toFixed(0);
        section += `| ${transport} | ${count} | ${pct}% |\n`;
      });

    section += `
### Retention Policy Analysis

| Retention Period | Count | Risk Level |
|------------------|-------|------------|
| Infinite (log compaction) | ${retentionStats.infinite} | ${retentionStats.infinite > 0 ? '⚠️ High' : '✓ None'} |
| Long-term (>30 days) | ${retentionStats.longTerm} | ${retentionStats.longTerm > 0 ? '⚠️ Medium' : '✓ None'} |
| Medium-term (7-30 days) | ${retentionStats.mediumTerm} | ${retentionStats.mediumTerm > 0 ? 'ℹ️ Low' : '✓ None'} |
| Short-term (<7 days) | ${retentionStats.shortTerm} | ✓ None |
| Unknown/Not configured | ${retentionStats.unknown} | ${retentionStats.unknown > 0 ? '⚠️ High' : '✓ None'} |

**Governance Note**: Infinite retention (log compaction) requires special attention for PII compliance (GDPR/CCPA right to be forgotten).
`;

    return section;
  }

  /**
   * Generate PII event retention analysis section
   */
  generatePIIEventRetention() {
    const events = this._getEventManifests();
    const piiEvents = events.filter(e =>
      e.schema?.fields?.some(f => f.pii && f.pii !== 'none')
    );

    if (piiEvents.length === 0) {
      return `## PII Event Retention & Compliance

_No PII-containing events detected._`;
    }

    // Analyze PII retention risks
    const risks = {
      critical: [],  // Infinite retention + PII
      high: [],      // Long-term retention + PII
      medium: []     // Medium-term retention + PII
    };

    piiEvents.forEach(event => {
      const retention = event.delivery?.contract?.retention;
      const piiFields = event.schema.fields.filter(f => f.pii && f.pii !== 'none');
      const risk = {
        urn: event.urn,
        name: this._extractEventName(event.urn),
        retention: retention || 'unknown',
        piiCount: piiFields.length,
        piiTypes: [...new Set(piiFields.map(f => f.pii))].join(', ')
      };

      if (retention === 'infinite' || retention === -1) {
        risks.critical.push(risk);
      } else if (!retention) {
        risks.critical.push(risk); // Unknown treated as critical
      } else {
        const days = this._parseRetentionDays(retention);
        if (days > 30) risks.high.push(risk);
        else if (days >= 7) risks.medium.push(risk);
      }
    });

    let section = `## PII Event Retention & Compliance

### PII Event Summary

- **Total PII-containing events**: ${piiEvents.length}
- **Critical retention risks**: ${risks.critical.length} ${risks.critical.length > 0 ? '🔴' : '✓'}
- **High retention risks**: ${risks.high.length} ${risks.high.length > 0 ? '⚠️' : '✓'}
- **Medium retention risks**: ${risks.medium.length} ${risks.medium.length > 0 ? 'ℹ️' : '✓'}

`;

    if (risks.critical.length > 0) {
      section += `### 🔴 Critical: Infinite/Unknown Retention with PII

The following events contain PII with infinite or unknown retention policies, creating GDPR/CCPA compliance risks:

| Event | Retention | PII Fields | PII Types |
|-------|-----------|------------|-----------|
`;
      risks.critical.forEach(r => {
        section += `| ${r.name} | ${r.retention} | ${r.piiCount} | ${r.piiTypes} |\n`;
      });

      section += `
**Action Required**: Configure finite retention or implement PII deletion mechanisms for right-to-be-forgotten compliance.

`;
    }

    if (risks.high.length > 0) {
      section += `### ⚠️ High: Long-term Retention with PII

Events with >30 day retention containing PII (review for compliance):

`;
      risks.high.slice(0, 5).forEach(r => {
        section += `- **${r.name}**: ${r.retention}, ${r.piiCount} PII field(s)\n`;
      });
      section += '\n';
    }

    section += `### Compliance Guidelines

1. **Right to Erasure**: Events with PII must support deletion within 30 days of request
2. **Retention Limits**: Default maximum 90 days for PII-containing events
3. **Infinite Retention**: Only permitted with explicit user consent and anonymization strategy
4. **Audit Trail**: Maintain records of PII deletion requests and execution
`;

    return section;
  }

  /**
   * Generate DLQ configuration validation section
   */
  generateDLQAnalysis() {
    const events = this._getEventManifests();
    const eventsWithPatterns = events.filter(e => e.patterns?.detected?.length > 0);

    if (eventsWithPatterns.length === 0) {
      return `## Dead Letter Queue (DLQ) Configuration

_No DLQ patterns detected yet._`;
    }

    // Analyze DLQ patterns from B4.2
    const dlqIssues = {
      missing: [],      // PII + retries without DLQ (error severity)
      unconfigured: [], // DLQ without retries (warn severity)
      healthy: []       // Properly configured
    };

    eventsWithPatterns.forEach(event => {
      const patterns = event.patterns.detected;
      const missingDLQ = patterns.find(p => p.pattern === 'missing_dlq');
      const dlqWithoutRetries = patterns.find(p => p.pattern === 'dlq_without_retries');
      const dlqConfigured = patterns.find(p => p.pattern === 'dlq_configured');

      if (missingDLQ) {
        dlqIssues.missing.push({
          urn: event.urn,
          name: this._extractEventName(event.urn),
          pattern: missingDLQ,
          hasPII: event.schema?.fields?.some(f => f.pii && f.pii !== 'none')
        });
      } else if (dlqWithoutRetries) {
        dlqIssues.unconfigured.push({
          urn: event.urn,
          name: this._extractEventName(event.urn),
          pattern: dlqWithoutRetries
        });
      } else if (dlqConfigured) {
        dlqIssues.healthy.push({
          urn: event.urn,
          name: this._extractEventName(event.urn),
          pattern: dlqConfigured
        });
      }
    });

    let section = `## Dead Letter Queue (DLQ) Configuration

### DLQ Configuration Summary

- **Missing DLQ (PII + retries)**: ${dlqIssues.missing.length} ${dlqIssues.missing.length > 0 ? '🔴' : '✓'}
- **DLQ without retry policy**: ${dlqIssues.unconfigured.length} ${dlqIssues.unconfigured.length > 0 ? '⚠️' : '✓'}
- **Properly configured DLQs**: ${dlqIssues.healthy.length} ✓

`;

    if (dlqIssues.missing.length > 0) {
      section += `### 🔴 Critical: Missing DLQ Configuration

The following PII-containing events have retry policies but no DLQ configuration:

| Event | Confidence | Recommendation |
|-------|------------|----------------|
`;
      dlqIssues.missing.forEach(issue => {
        const conf = (issue.pattern.confidence * 100).toFixed(0);
        section += `| ${issue.name} | ${conf}% | ${issue.pattern.recommendation} |\n`;
      });

      section += `
**Compliance Risk**: Unprocessed PII events may accumulate indefinitely, violating GDPR/CCPA retention limits.

`;
    }

    if (dlqIssues.unconfigured.length > 0) {
      section += `### ⚠️ Warning: Unusual DLQ Configuration

Events with DLQ but no retry policy (review configuration):

`;
      dlqIssues.unconfigured.slice(0, 5).forEach(issue => {
        section += `- **${issue.name}**: ${issue.pattern.message}\n`;
      });
      section += '\n';
    }

    if (dlqIssues.healthy.length > 0) {
      section += `### ✓ Healthy DLQ Configurations

${dlqIssues.healthy.length} event(s) with proper DLQ and retry configuration.

`;
    }

    section += `### DLQ Best Practices

1. **PII Events**: Always configure DLQ for events containing PII with retry policies
2. **Retry Strategy**: Use exponential backoff with max attempts (3-5 retries recommended)
3. **DLQ Monitoring**: Alert on DLQ depth > 100 messages (indicates systemic issues)
4. **DLQ Retention**: Set finite retention (7-14 days) with automated purge
`;

    return section;
  }

  /**
   * Generate event fanout risk assessment section
   */
  generateEventFanoutAnalysis() {
    const events = this._getEventManifests();
    const eventsWithPatterns = events.filter(e => e.patterns?.detected?.length > 0);

    const fanoutRisks = {
      high: [],      // >5 subscribers
      medium: [],    // 3-5 subscribers
      low: []        // <3 subscribers
    };

    eventsWithPatterns.forEach(event => {
      const patterns = event.patterns.detected;
      const highFanout = patterns.find(p => p.pattern === 'high_fanout');
      const moderateFanout = patterns.find(p => p.pattern === 'moderate_fanout');

      if (highFanout) {
        const count = highFanout.metadata?.subscriber_count || 0;
        if (count > 5) {
          fanoutRisks.high.push({
            urn: event.urn,
            name: this._extractEventName(event.urn),
            count,
            hasPII: event.schema?.fields?.some(f => f.pii && f.pii !== 'none'),
            pattern: highFanout
          });
        } else {
          fanoutRisks.medium.push({
            urn: event.urn,
            name: this._extractEventName(event.urn),
            count,
            hasPII: event.schema?.fields?.some(f => f.pii && f.pii !== 'none'),
            pattern: highFanout
          });
        }
      } else if (moderateFanout) {
        fanoutRisks.medium.push({
          urn: event.urn,
          name: this._extractEventName(event.urn),
          count: moderateFanout.metadata?.subscriber_count || 0,
          hasPII: event.schema?.fields?.some(f => f.pii && f.pii !== 'none'),
          pattern: moderateFanout
        });
      }
    });

    if (fanoutRisks.high.length === 0 && fanoutRisks.medium.length === 0) {
      return `## Event Fanout & Multiplication Risk

_No high-fanout events detected (all events have <3 subscribers)._`;
    }

    let section = `## Event Fanout & Multiplication Risk

### Fanout Risk Summary

- **High fanout (>5 subscribers)**: ${fanoutRisks.high.length} ${fanoutRisks.high.length > 0 ? '⚠️' : '✓'}
- **Moderate fanout (3-5 subscribers)**: ${fanoutRisks.medium.length} ${fanoutRisks.medium.length > 0 ? 'ℹ️' : '✓'}

`;

    if (fanoutRisks.high.length > 0) {
      section += `### ⚠️ High Fanout Events

The following events have >5 subscribers, amplifying PII exposure and retention:

| Event | Subscribers | Has PII | Retention Multiplier |
|-------|-------------|---------|---------------------|
`;
      fanoutRisks.high.forEach(risk => {
        const piiIcon = risk.hasPII ? '🔴 Yes' : '✓ No';
        section += `| ${risk.name} | ${risk.count} | ${piiIcon} | ${risk.count}x |\n`;
      });

      section += `
**Exposure Risk**: Each subscriber potentially stores a copy of the event, multiplying PII exposure by subscriber count.

`;
    }

    if (fanoutRisks.medium.length > 0) {
      section += `### ℹ️ Moderate Fanout Events

Events with 3-5 subscribers (monitor for fanout expansion):

`;
      fanoutRisks.medium.slice(0, 5).forEach(risk => {
        const piiNote = risk.hasPII ? ' (contains PII)' : '';
        section += `- **${risk.name}**: ${risk.count} subscribers${piiNote}\n`;
      });
      section += '\n';
    }

    section += `### Fanout Governance Guidelines

1. **PII Events**: Limit subscribers to <3 for PII-containing events where possible
2. **Fanout Audits**: Review subscriber lists quarterly; remove inactive consumers
3. **Retention Multiplication**: Each subscriber multiplies storage cost and retention risk
4. **Access Control**: Ensure all subscribers have legitimate business need for data
`;

    return section;
  }

  /**
   * Generate replay risk assessment section
   */
  generateReplayRiskAssessment() {
    const events = this._getEventManifests();

    const replayRisks = {
      critical: [],  // Infinite retention with PII
      high: [],      // Log compaction with PII
      medium: []     // Long retention with replay capability
    };

    events.forEach(event => {
      const retention = event.delivery?.contract?.retention;
      const transport = event.delivery?.contract?.transport;
      const hasPII = event.schema?.fields?.some(f => f.pii && f.pii !== 'none');
      const compaction = event.delivery?.contract?.metadata?.['cleanup.policy'] === 'compact';

      const risk = {
        urn: event.urn,
        name: this._extractEventName(event.urn),
        transport,
        retention: retention || 'unknown',
        hasPII,
        compaction
      };

      // Kafka log compaction with PII = critical risk
      if (compaction && hasPII) {
        replayRisks.critical.push(risk);
      } else if ((retention === 'infinite' || retention === -1) && hasPII) {
        replayRisks.high.push(risk);
      } else if (retention && this._parseRetentionDays(retention) > 30) {
        replayRisks.medium.push(risk);
      }
    });

    if (replayRisks.critical.length === 0 && replayRisks.high.length === 0 && replayRisks.medium.length === 0) {
      return `## Event Replay & Reprocessing Risk

_No significant replay risks detected._`;
    }

    let section = `## Event Replay & Reprocessing Risk

### Replay Risk Summary

Event streams with long retention enable historical replay, creating compliance risks for PII data.

- **Critical (compaction + PII)**: ${replayRisks.critical.length} ${replayRisks.critical.length > 0 ? '🔴' : '✓'}
- **High (infinite retention + PII)**: ${replayRisks.high.length} ${replayRisks.high.length > 0 ? '⚠️' : '✓'}
- **Medium (long retention)**: ${replayRisks.medium.length} ${replayRisks.medium.length > 0 ? 'ℹ️' : '✓'}

`;

    if (replayRisks.critical.length > 0) {
      section += `### 🔴 Critical: Log Compaction with PII

Kafka log compaction retains last value per key indefinitely, creating GDPR compliance risk:

| Event | Transport | Retention | PII Risk |
|-------|-----------|-----------|----------|
`;
      replayRisks.critical.forEach(r => {
        section += `| ${r.name} | ${r.transport} | ${r.retention} (compacted) | High |\n`;
      });

      section += `
**Compliance Risk**: Log compaction prevents true deletion. Consider tombstone records or partition purging for GDPR compliance.

`;
    }

    if (replayRisks.high.length > 0) {
      section += `### ⚠️ High: Infinite Retention with PII

Events with unlimited replay windows containing PII:

`;
      replayRisks.high.slice(0, 5).forEach(r => {
        section += `- **${r.name}**: ${r.transport}, ${r.retention} retention\n`;
      });
      section += '\n';
    }

    section += `### Replay Governance Guidelines

1. **PII Deletion**: Implement tombstone pattern (null payload with key) for GDPR erasure
2. **Replay Auditing**: Log all historical replays with business justification
3. **Finite Windows**: Default 90-day maximum retention for PII events
4. **Compaction Policy**: Avoid log compaction for PII-containing topics
`;

    return section;
  }

  /**
   * Generate Mermaid event flow diagram
   */
  generateEventFlowDiagram() {
    const events = this._getEventManifests().slice(0, 10); // Limit for readability

    if (events.length === 0) {
      return '_No events in system yet._';
    }

    let mermaid = '```mermaid\ngraph LR\n';

    // Group by transport
    const byTransport = {};
    events.forEach(event => {
      const transport = event.delivery?.contract?.transport || 'unknown';
      if (!byTransport[transport]) byTransport[transport] = [];
      byTransport[transport].push(event);
    });

    // Generate nodes and flows
    Object.entries(byTransport).forEach(([transport, transportEvents]) => {
      const transportId = this._sanitizeId(transport);
      mermaid += `  ${transportId}["${transport.toUpperCase()}"]\n`;

      transportEvents.forEach((event, i) => {
        const eventId = this._sanitizeId(event.urn);
        const name = this._extractEventName(event.urn);
        const hasPII = event.schema?.fields?.some(f => f.pii && f.pii !== 'none');
        const piiIcon = hasPII ? '🔒' : '';
        const retention = event.delivery?.contract?.retention || '?';

        mermaid += `  ${eventId}["${name}${piiIcon}\\n${retention}"]\n`;
        mermaid += `  ${transportId} --> ${eventId}\n`;

        // Show fanout if detected
        const fanoutPattern = event.patterns?.detected?.find(p =>
          p.pattern === 'high_fanout' || p.pattern === 'moderate_fanout'
        );
        if (fanoutPattern) {
          const count = fanoutPattern.metadata?.subscriber_count || 0;
          const consumerId = `${eventId}_consumers`;
          mermaid += `  ${consumerId}["${count} subscribers"]\n`;
          mermaid += `  ${eventId} --> ${consumerId}\n`;
        }
      });
    });

    mermaid += '```\n';
    return mermaid;
  }

  /**
   * Helper: Extract event name from URN
   */
  _extractEventName(urn) {
    // URN format: urn:events:{domain}:{entity}:{action} or urn:proto:event:...
    const match = urn.match(/urn:events:([^:]+):([^:]+):([^@]+)/);
    if (match) {
      const [, domain, entity, action] = match;
      return `${entity}.${action}`;
    }

    const protoMatch = urn.match(/urn:proto:event:([^/]+)\/([^@]+)/);
    if (protoMatch) {
      return protoMatch[2];
    }

    return urn.substring(0, 30);
  }

  /**
   * Helper: Sanitize ID for Mermaid
   */
  _sanitizeId(str) {
    return str.replace(/[^a-zA-Z0-9]/g, '_');
  }

  /**
   * Helper: Parse retention value to days
   */
  _parseRetentionDays(retention) {
    if (typeof retention === 'number') return retention;
    if (typeof retention === 'string') {
      // Parse formats like "7d", "604800000ms", "604800s", etc.
      const match = retention.match(/^(\d+)(ms|d|days?|h|hours?|m|minutes?|s|seconds?)?$/i);
      if (match) {
        const [, value, unit = 'd'] = match;
        const num = parseInt(value, 10);
        const lower = unit.toLowerCase();

        // Check 'ms' BEFORE 'm' to avoid matching minutes incorrectly
        if (lower === 'ms') return num / (24 * 60 * 60 * 1000);
        if (lower.startsWith('d')) return num;
        if (lower.startsWith('h')) return num / 24;
        if (lower.startsWith('m')) return num / (24 * 60);
        if (lower.startsWith('s')) return num / (24 * 60 * 60);
      }

      // Try parsing as milliseconds (common in Kafka)
      const ms = parseInt(retention, 10);
      if (!isNaN(ms)) {
        return ms / (24 * 60 * 60 * 1000);
      }
    }
    return 0;
  }
}

export { EventSectionGenerators };

export default {
  EventSectionGenerators
};
