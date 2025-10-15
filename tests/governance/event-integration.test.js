/**
 * Event Governance Integration Test
 *
 * End-to-end test for event governance generation:
 * - Import AsyncAPI spec with patterns
 * - Generate complete GOVERNANCE.md with event sections
 * - Validate all event governance sections present
 */

import governance from '../../packages/protocols/core/governance/index.mjs';
import graphCore from '../../packages/protocols/core/graph/index.mjs';
import overrides from '../../packages/protocols/core/overrides/index.js';

const { GovernanceGenerator } = governance;
const { ProtocolGraph } = graphCore;
const { OverrideEngine } = overrides;

describe('Event Governance Integration', () => {
  test('should generate complete GOVERNANCE.md with event sections', async () => {
    // Setup: Create event manifests with patterns (simulating B4.1 + B4.2 output)
    const eventManifests = [
      {
        protocol: 'event',
        urn: 'urn:proto:event:acme/user.created@1.0',
        delivery: {
          contract: {
            transport: 'kafka',
            retention: 'infinite',
            retry_policy: 'exponential',
            metadata: {
              'cleanup.policy': 'compact'
            }
          }
        },
        schema: {
          fields: [
            { name: 'user_id', type: 'string', pii: 'user_id' },
            { name: 'email', type: 'string', pii: 'email' },
            { name: 'created_at', type: 'timestamp', pii: 'none' }
          ]
        },
        patterns: {
          detected: [
            {
              pattern: 'missing_dlq',
              confidence: 0.90,
              severity: 'error',
              message: 'PII events with retries must declare a DLQ',
              recommendation: 'Configure dead letter queue to prevent unprocessed PII accumulation'
            },
            {
              pattern: 'high_fanout',
              confidence: 0.75,
              severity: 'info',
              message: '6 subscribers detected',
              metadata: {
                subscriber_count: 6
              }
            }
          ]
        }
      },
      {
        protocol: 'event',
        urn: 'urn:proto:event:acme/order.placed@1.0',
        delivery: {
          contract: {
            transport: 'kafka',
            retention: '90d',
            retry_policy: 'exponential',
            dlq: 'orders.order.placed.dlq'
          }
        },
        schema: {
          fields: [
            { name: 'order_id', type: 'string', pii: 'none' },
            { name: 'customer_email', type: 'string', pii: 'email' },
            { name: 'amount', type: 'number', pii: 'none' }
          ]
        },
        patterns: {
          detected: [
            {
              pattern: 'dlq_configured',
              confidence: 0.95,
              severity: 'info',
              message: 'DLQ properly configured for PII event with retries'
            }
          ]
        }
      },
      {
        protocol: 'event',
        urn: 'urn:proto:event:acme/email.sent@1.0',
        delivery: {
          contract: {
            transport: 'amqp',
            retention: '7d',
            retry_policy: 'none'
          }
        },
        schema: {
          fields: [
            { name: 'to', type: 'string', pii: 'email' },
            { name: 'subject', type: 'string', pii: 'none' }
          ]
        },
        patterns: {
          detected: []
        }
      }
    ];

    // Setup graph and generator
    const graph = new ProtocolGraph();
    const overrideEngine = new OverrideEngine();

    // Add manifests to graph
    eventManifests.forEach(manifest => {
      graph.addNode(manifest.urn, 'event', manifest);
    });

    const generator = new GovernanceGenerator({
      graph,
      overrideEngine,
      manifests: eventManifests
    });

    // Generate GOVERNANCE.md
    const content = await generator.generate({
      sections: ['all'],
      includeDiagrams: true,
      includePIIFlow: true,
      includeMetrics: true
    });

    // Validate: Event delivery overview section
    expect(content).toContain('## Event Streaming & Delivery');
    expect(content).toContain('3 event stream(s)');
    expect(content).toContain('kafka');
    expect(content).toContain('amqp');
    expect(content).toContain('Retention Policy Analysis');
    expect(content).toContain('Infinite (log compaction)');

    // Validate: PII event retention section
    expect(content).toContain('## PII Event Retention & Compliance');
    expect(content).toContain('Total PII-containing events**: 3');
    expect(content).toContain('Critical retention risks');
    expect(content).toContain('user.created');
    expect(content).toContain('infinite');
    expect(content).toContain('Right to Erasure');

    // Validate: DLQ analysis section
    expect(content).toContain('## Dead Letter Queue (DLQ) Configuration');
    expect(content).toContain('Missing DLQ (PII + retries)**: 1 🔴');
    expect(content).toContain('Properly configured DLQs**: 1 ✓');
    expect(content).toContain('Configure dead letter queue');

    // Validate: Fanout analysis section
    expect(content).toContain('## Event Fanout & Multiplication Risk');
    expect(content).toContain('6 subscribers');
    expect(content).toContain('6x'); // retention multiplier

    // Validate: Replay risk section
    expect(content).toContain('## Event Replay & Reprocessing Risk');
    expect(content).toContain('Critical (compaction + PII)');
    expect(content).toContain('tombstone');

    // Validate: Event flow diagram
    expect(content).toContain('Event Flow Visualization');
    expect(content).toContain('```mermaid');
    expect(content).toContain('KAFKA');
    expect(content).toContain('AMQP');
    expect(content).toContain('🔒'); // PII icon

    // Validate: Traditional sections still present
    expect(content).toContain('## System Overview');
    expect(content).toContain('Total Protocols**: 3');
  });

  test('should handle empty event manifests gracefully', async () => {
    const graph = new ProtocolGraph();
    const overrideEngine = new OverrideEngine();

    const generator = new GovernanceGenerator({
      graph,
      overrideEngine,
      manifests: []
    });

    const content = await generator.generate({
      sections: ['events'],
      includeDiagrams: true
    });

    expect(content).toContain('No event protocols detected');
    expect(content).toContain('No PII-containing events detected');
    expect(content).toContain('No DLQ patterns detected');
  });

  test('should generate event sections only when requested', async () => {
    const eventManifests = [
      {
        protocol: 'event',
        urn: 'urn:proto:event:acme/user.created@1.0',
        delivery: {
          contract: {
            transport: 'kafka',
            retention: '7d'
          }
        }
      }
    ];

    const graph = new ProtocolGraph();
    graph.addNode(eventManifests[0].urn, 'event', eventManifests[0]);

    const generator = new GovernanceGenerator({
      graph,
      overrideEngine: new OverrideEngine(),
      manifests: eventManifests
    });

    // Generate without event sections
    const withoutEvents = await generator.generate({
      sections: ['overview', 'privacy'],
      includeDiagrams: false
    });

    expect(withoutEvents).toContain('## System Overview');
    expect(withoutEvents).toContain('## Data Privacy & PII Management');
    expect(withoutEvents).not.toContain('## Event Streaming & Delivery');

    // Generate with event sections
    const withEvents = await generator.generate({
      sections: ['events'],
      includeDiagrams: true
    });

    expect(withEvents).toContain('## Event Streaming & Delivery');
    expect(withEvents).toContain('Event Flow Visualization');
  });
});
