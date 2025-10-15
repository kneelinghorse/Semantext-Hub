/**
 * Event Governance Section Generator Tests
 *
 * Tests event-specific governance sections:
 * - Event delivery overview
 * - PII event retention analysis
 * - DLQ configuration validation
 * - Event fanout risk assessment
 * - Replay risk assessment
 * - Event flow diagrams
 */

import eventGen from '../../packages/protocols/core/governance/event-section-generator.mjs';
import graphCore from '../../packages/protocols/core/graph/index.mjs';
import overrides from '../../packages/protocols/core/overrides/index.js';

const { EventSectionGenerators } = eventGen;
const { ProtocolGraph } = graphCore;
const { OverrideEngine } = overrides;

describe('EventSectionGenerators', () => {
  let graph;
  let overrideEngine;
  let generators;

  beforeEach(() => {
    graph = new ProtocolGraph();
    overrideEngine = new OverrideEngine();
  });

  describe('Event Delivery Overview', () => {
    test('should generate empty state when no events', () => {
      generators = new EventSectionGenerators(graph, overrideEngine, []);
      const section = generators.generateEventDeliveryOverview();

      expect(section).toContain('## Event Streaming & Delivery');
      expect(section).toContain('No event protocols detected');
    });

    test('should generate transport distribution stats', () => {
      const manifests = [
        {
          protocol: 'event',
          urn: 'urn:events:users:user:created@1.0',
          delivery: {
            contract: {
              transport: 'kafka',
              retention: '7d'
            }
          }
        },
        {
          protocol: 'event',
          urn: 'urn:events:orders:order:placed@1.0',
          delivery: {
            contract: {
              transport: 'kafka',
              retention: '30d'
            }
          }
        },
        {
          protocol: 'event',
          urn: 'urn:events:notifications:email:sent@1.0',
          delivery: {
            contract: {
              transport: 'amqp',
              retention: '1d'
            }
          }
        }
      ];

      generators = new EventSectionGenerators(graph, overrideEngine, manifests);
      const section = generators.generateEventDeliveryOverview();

      expect(section).toContain('3 event stream(s)');
      expect(section).toContain('2 transport protocol(s)');
      expect(section).toContain('kafka');
      expect(section).toContain('amqp');
      expect(section).toContain('67%'); // 2/3 kafka
      expect(section).toContain('33%'); // 1/3 amqp
    });

    test('should categorize retention periods correctly', () => {
      const manifests = [
        {
          protocol: 'event',
          urn: 'urn:events:users:user:created@1.0',
          delivery: {
            contract: {
              transport: 'kafka',
              retention: 'infinite'
            }
          }
        },
        {
          protocol: 'event',
          urn: 'urn:events:orders:order:placed@1.0',
          delivery: {
            contract: {
              transport: 'kafka',
              retention: '90d'
            }
          }
        },
        {
          protocol: 'event',
          urn: 'urn:events:sessions:session:started@1.0',
          delivery: {
            contract: {
              transport: 'kafka',
              retention: '7d'
            }
          }
        },
        {
          protocol: 'event',
          urn: 'urn:events:metrics:metric:recorded@1.0',
          delivery: {
            contract: {
              transport: 'kafka',
              retention: '1d'
            }
          }
        }
      ];

      generators = new EventSectionGenerators(graph, overrideEngine, manifests);
      const section = generators.generateEventDeliveryOverview();

      expect(section).toContain('Infinite (log compaction) | 1');
      expect(section).toContain('Long-term (>30 days) | 1');
      expect(section).toContain('Medium-term (7-30 days) | 1');
      expect(section).toContain('Short-term (<7 days) | 1');
      expect(section).toContain('⚠️ High'); // Infinite retention warning
    });
  });

  describe('PII Event Retention Analysis', () => {
    test('should generate empty state when no PII events', () => {
      const manifests = [
        {
          protocol: 'event',
          urn: 'urn:events:metrics:metric:recorded@1.0',
          delivery: { contract: { transport: 'kafka', retention: '7d' } },
          schema: {
            fields: [
              { name: 'metric_name', type: 'string', pii: 'none' },
              { name: 'value', type: 'number', pii: 'none' }
            ]
          }
        }
      ];

      generators = new EventSectionGenerators(graph, overrideEngine, manifests);
      const section = generators.generatePIIEventRetention();

      expect(section).toContain('## PII Event Retention & Compliance');
      expect(section).toContain('No PII-containing events detected');
    });

    test('should identify critical retention risks (infinite + PII)', () => {
      const manifests = [
        {
          protocol: 'event',
          urn: 'urn:events:users:user:profile_updated@1.0',
          delivery: {
            contract: {
              transport: 'kafka',
              retention: 'infinite'
            }
          },
          schema: {
            fields: [
              { name: 'user_id', type: 'string', pii: 'user_id' },
              { name: 'email', type: 'string', pii: 'email' },
              { name: 'phone', type: 'string', pii: 'phone' }
            ]
          }
        }
      ];

      generators = new EventSectionGenerators(graph, overrideEngine, manifests);
      const section = generators.generatePIIEventRetention();

      expect(section).toContain('Total PII-containing events**: 1');
      expect(section).toContain('Critical retention risks**: 1 🔴');
      expect(section).toContain('Infinite/Unknown Retention with PII');
      expect(section).toContain('user.profile_updated');
      expect(section).toContain('infinite');
      expect(section).toContain('3'); // 3 PII fields
      expect(section).toContain('GDPR/CCPA compliance risks');
    });

    test('should identify high retention risks (long-term + PII)', () => {
      const manifests = [
        {
          protocol: 'event',
          urn: 'urn:events:orders:order:placed@1.0',
          delivery: {
            contract: {
              transport: 'kafka',
              retention: '90d'
            }
          },
          schema: {
            fields: [
              { name: 'order_id', type: 'string', pii: 'none' },
              { name: 'customer_email', type: 'string', pii: 'email' }
            ]
          }
        }
      ];

      generators = new EventSectionGenerators(graph, overrideEngine, manifests);
      const section = generators.generatePIIEventRetention();

      expect(section).toContain('High retention risks**: 1');
      expect(section).toContain('Long-term Retention with PII');
      expect(section).toContain('order.placed');
      expect(section).toContain('90d');
    });

    test('should include compliance guidelines', () => {
      const manifests = [
        {
          protocol: 'event',
          urn: 'urn:events:users:user:created@1.0',
          delivery: {
            contract: {
              transport: 'kafka',
              retention: 'infinite'
            }
          },
          schema: {
            fields: [{ name: 'email', type: 'string', pii: 'email' }]
          }
        }
      ];

      generators = new EventSectionGenerators(graph, overrideEngine, manifests);
      const section = generators.generatePIIEventRetention();

      expect(section).toContain('Compliance Guidelines');
      expect(section).toContain('Right to Erasure');
      expect(section).toContain('30 days of request');
      expect(section).toContain('90 days');
    });
  });

  describe('DLQ Configuration Validation', () => {
    test('should generate empty state when no patterns', () => {
      const manifests = [
        {
          protocol: 'event',
          urn: 'urn:events:metrics:metric:recorded@1.0',
          delivery: { contract: { transport: 'kafka', retention: '7d' } }
        }
      ];

      generators = new EventSectionGenerators(graph, overrideEngine, manifests);
      const section = generators.generateDLQAnalysis();

      expect(section).toContain('## Dead Letter Queue (DLQ) Configuration');
      expect(section).toContain('No DLQ patterns detected');
    });

    test('should identify missing DLQ for PII events', () => {
      const manifests = [
        {
          protocol: 'event',
          urn: 'urn:events:users:user:created@1.0',
          delivery: {
            contract: {
              transport: 'kafka',
              retry_policy: 'exponential'
            }
          },
          schema: {
            fields: [{ name: 'email', type: 'string', pii: 'email' }]
          },
          patterns: {
            detected: [
              {
                pattern: 'missing_dlq',
                confidence: 0.90,
                severity: 'error',
                message: 'PII events with retries must declare a DLQ',
                recommendation: 'Configure dead letter queue to prevent unprocessed PII accumulation'
              }
            ]
          }
        }
      ];

      generators = new EventSectionGenerators(graph, overrideEngine, manifests);
      const section = generators.generateDLQAnalysis();

      expect(section).toContain('Missing DLQ (PII + retries)**: 1 🔴');
      expect(section).toContain('Critical: Missing DLQ Configuration');
      expect(section).toContain('user.created');
      expect(section).toContain('90%');
      expect(section).toContain('Configure dead letter queue');
      expect(section).toContain('Compliance Risk');
    });

    test('should identify DLQ without retry policy', () => {
      const manifests = [
        {
          protocol: 'event',
          urn: 'urn:events:orders:order:placed@1.0',
          patterns: {
            detected: [
              {
                pattern: 'dlq_without_retries',
                confidence: 0.75,
                severity: 'warn',
                message: 'DLQ configured but no retry policy'
              }
            ]
          }
        }
      ];

      generators = new EventSectionGenerators(graph, overrideEngine, manifests);
      const section = generators.generateDLQAnalysis();

      expect(section).toContain('DLQ without retry policy**: 1 ⚠️');
      expect(section).toContain('Unusual DLQ Configuration');
      expect(section).toContain('order.placed');
    });

    test('should show healthy DLQ configurations', () => {
      const manifests = [
        {
          protocol: 'event',
          urn: 'urn:events:users:user:created@1.0',
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
        }
      ];

      generators = new EventSectionGenerators(graph, overrideEngine, manifests);
      const section = generators.generateDLQAnalysis();

      expect(section).toContain('Properly configured DLQs**: 1 ✓');
      expect(section).toContain('Healthy DLQ Configurations');
    });
  });

  describe('Event Fanout Risk Assessment', () => {
    test('should generate empty state for low fanout', () => {
      const manifests = [
        {
          protocol: 'event',
          urn: 'urn:events:users:user:created@1.0',
          patterns: { detected: [] }
        }
      ];

      generators = new EventSectionGenerators(graph, overrideEngine, manifests);
      const section = generators.generateEventFanoutAnalysis();

      expect(section).toContain('## Event Fanout & Multiplication Risk');
      expect(section).toContain('all events have <3 subscribers');
    });

    test('should identify high fanout events', () => {
      const manifests = [
        {
          protocol: 'event',
          urn: 'urn:events:users:user:created@1.0',
          schema: {
            fields: [{ name: 'email', type: 'string', pii: 'email' }]
          },
          patterns: {
            detected: [
              {
                pattern: 'high_fanout',
                confidence: 0.75,
                severity: 'info',
                message: '8 subscribers detected',
                metadata: {
                  subscriber_count: 8
                }
              }
            ]
          }
        }
      ];

      generators = new EventSectionGenerators(graph, overrideEngine, manifests);
      const section = generators.generateEventFanoutAnalysis();

      expect(section).toContain('High fanout (>5 subscribers)**: 1 ⚠️');
      expect(section).toContain('High Fanout Events');
      expect(section).toContain('user.created');
      expect(section).toContain('8'); // subscriber count
      expect(section).toContain('🔴 Yes'); // has PII
      expect(section).toContain('8x'); // retention multiplier
    });

    test('should identify moderate fanout events', () => {
      const manifests = [
        {
          protocol: 'event',
          urn: 'urn:events:orders:order:placed@1.0',
          patterns: {
            detected: [
              {
                pattern: 'moderate_fanout',
                confidence: 0.70,
                severity: 'info',
                message: '4 subscribers detected',
                metadata: {
                  subscriber_count: 4
                }
              }
            ]
          }
        }
      ];

      generators = new EventSectionGenerators(graph, overrideEngine, manifests);
      const section = generators.generateEventFanoutAnalysis();

      expect(section).toContain('Moderate fanout (3-5 subscribers)**: 1');
      expect(section).toContain('order.placed');
      expect(section).toContain('4 subscribers');
    });
  });

  describe('Replay Risk Assessment', () => {
    test('should generate empty state for no risks', () => {
      const manifests = [
        {
          protocol: 'event',
          urn: 'urn:events:metrics:metric:recorded@1.0',
          delivery: {
            contract: {
              transport: 'kafka',
              retention: '1d'
            }
          },
          schema: {
            fields: [{ name: 'value', type: 'number', pii: 'none' }]
          }
        }
      ];

      generators = new EventSectionGenerators(graph, overrideEngine, manifests);
      const section = generators.generateReplayRiskAssessment();

      expect(section).toContain('## Event Replay & Reprocessing Risk');
      expect(section).toContain('No significant replay risks detected');
    });

    test('should identify critical risk (log compaction + PII)', () => {
      const manifests = [
        {
          protocol: 'event',
          urn: 'urn:events:users:user:profile_updated@1.0',
          delivery: {
            contract: {
              transport: 'kafka',
              retention: 'infinite',
              metadata: {
                'cleanup.policy': 'compact'
              }
            }
          },
          schema: {
            fields: [{ name: 'email', type: 'string', pii: 'email' }]
          }
        }
      ];

      generators = new EventSectionGenerators(graph, overrideEngine, manifests);
      const section = generators.generateReplayRiskAssessment();

      expect(section).toContain('Critical (compaction + PII)**: 1 🔴');
      expect(section).toContain('Log Compaction with PII');
      expect(section).toContain('user.profile_updated');
      expect(section).toContain('infinite (compacted)');
      expect(section).toContain('tombstone records');
    });

    test('should identify high risk (infinite retention + PII)', () => {
      const manifests = [
        {
          protocol: 'event',
          urn: 'urn:events:users:user:created@1.0',
          delivery: {
            contract: {
              transport: 'kafka',
              retention: -1
            }
          },
          schema: {
            fields: [{ name: 'email', type: 'string', pii: 'email' }]
          }
        }
      ];

      generators = new EventSectionGenerators(graph, overrideEngine, manifests);
      const section = generators.generateReplayRiskAssessment();

      expect(section).toContain('High (infinite retention + PII)**: 1 ⚠️');
      expect(section).toContain('Infinite Retention with PII');
    });
  });

  describe('Event Flow Diagram', () => {
    test('should generate empty state for no events', () => {
      generators = new EventSectionGenerators(graph, overrideEngine, []);
      const diagram = generators.generateEventFlowDiagram();

      expect(diagram).toContain('No events in system yet');
    });

    test('should generate Mermaid diagram for events', () => {
      const manifests = [
        {
          protocol: 'event',
          urn: 'urn:events:users:user:created@1.0',
          delivery: {
            contract: {
              transport: 'kafka',
              retention: '7d'
            }
          },
          schema: {
            fields: [{ name: 'email', type: 'string', pii: 'email' }]
          }
        },
        {
          protocol: 'event',
          urn: 'urn:events:orders:order:placed@1.0',
          delivery: {
            contract: {
              transport: 'amqp',
              retention: '1d'
            }
          }
        }
      ];

      generators = new EventSectionGenerators(graph, overrideEngine, manifests);
      const diagram = generators.generateEventFlowDiagram();

      expect(diagram).toContain('```mermaid');
      expect(diagram).toContain('graph LR');
      expect(diagram).toContain('KAFKA');
      expect(diagram).toContain('AMQP');
      expect(diagram).toContain('user.created');
      expect(diagram).toContain('🔒'); // PII icon
      expect(diagram).toContain('7d');
      expect(diagram).toContain('order.placed');
    });

    test('should show fanout in diagram', () => {
      const manifests = [
        {
          protocol: 'event',
          urn: 'urn:events:users:user:created@1.0',
          delivery: {
            contract: {
              transport: 'kafka',
              retention: '7d'
            }
          },
          patterns: {
            detected: [
              {
                pattern: 'high_fanout',
                metadata: {
                  subscriber_count: 5
                }
              }
            ]
          }
        }
      ];

      generators = new EventSectionGenerators(graph, overrideEngine, manifests);
      const diagram = generators.generateEventFlowDiagram();

      expect(diagram).toContain('5 subscribers');
      expect(diagram).toContain('-->'); // Arrow to consumers
    });
  });

  describe('Helper Methods', () => {
    test('_parseRetentionDays should parse various formats', () => {
      generators = new EventSectionGenerators(graph, overrideEngine, []);

      expect(generators._parseRetentionDays('7d')).toBe(7);
      expect(generators._parseRetentionDays('7days')).toBe(7);
      expect(generators._parseRetentionDays('24h')).toBe(1);
      expect(generators._parseRetentionDays('1440m')).toBe(1);
      expect(generators._parseRetentionDays('86400s')).toBe(1);
      expect(generators._parseRetentionDays('604800000ms')).toBe(7); // ms with unit
      expect(generators._parseRetentionDays(30)).toBe(30);
    });

    test('_extractEventName should parse URNs', () => {
      generators = new EventSectionGenerators(graph, overrideEngine, []);

      expect(generators._extractEventName('urn:events:users:user:created@1.0'))
        .toBe('user.created');
      expect(generators._extractEventName('urn:events:orders:order:placed@1.0'))
        .toBe('order.placed');
      expect(generators._extractEventName('urn:proto:event:acme/user.created@1.0'))
        .toBe('user.created');
    });
  });
});
