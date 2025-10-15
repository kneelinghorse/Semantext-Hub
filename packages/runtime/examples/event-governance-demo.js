/**
 * Event Governance Demo
 *
 * Demonstrates B4.3 event governance generation from AsyncAPI manifests with patterns.
 *
 * Usage:
 *   node app/examples/event-governance-demo.js
 */

const { GovernanceGenerator } = require('../core/governance');
const { ProtocolGraph } = require('../core/graph');
const { OverrideEngine } = require('../core/overrides');

async function demo() {
  console.log('🔄 Event Governance Demo\n');

  // Simulate event manifests from B4.1 (AsyncAPI import) + B4.2 (pattern detection)
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
          { name: 'name', type: 'string', pii: 'name' },
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
            recommendation: 'Configure dead letter queue to prevent unprocessed PII accumulation',
            metadata: {
              has_pii: true,
              retry_policy: 'exponential'
            }
          },
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
            message: 'DLQ properly configured for PII event with retries',
            metadata: {
              has_pii: true,
              retry_policy: 'exponential',
              dlq_config: 'orders.order.placed.dlq'
            }
          },
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
          { name: 'subject', type: 'string', pii: 'none' },
          { name: 'sent_at', type: 'timestamp', pii: 'none' }
        ]
      },
      patterns: {
        detected: []
      }
    }
  ];

  // Setup graph
  const graph = new ProtocolGraph();
  eventManifests.forEach(manifest => {
    graph.addNode(manifest.urn, 'event', manifest);
  });

  console.log(`✅ Loaded ${eventManifests.length} event manifests into graph\n`);

  // Generate governance documentation
  const generator = new GovernanceGenerator({
    graph,
    overrideEngine: new OverrideEngine(),
    manifests: eventManifests
  });

  console.log('📊 Generating GOVERNANCE.md with event sections...\n');

  const content = await generator.generate({
    sections: ['all'],
    includeDiagrams: true,
    includePIIFlow: true,
    includeMetrics: true
  });

  // Extract event sections for display
  const sections = [
    'Event Streaming & Delivery',
    'PII Event Retention & Compliance',
    'Dead Letter Queue (DLQ) Configuration',
    'Event Fanout & Multiplication Risk',
    'Event Replay & Reprocessing Risk'
  ];

  console.log('📋 Generated Event Governance Sections:\n');
  sections.forEach(section => {
    if (content.includes(section)) {
      console.log(`   ✅ ${section}`);
    }
  });

  // Show key findings
  console.log('\n🔍 Key Governance Findings:\n');

  if (content.includes('Critical retention risks**: 1 🔴')) {
    console.log('   🔴 CRITICAL: 1 event with infinite retention + PII');
    console.log('      → user.created: Log compaction prevents GDPR deletion');
  }

  if (content.includes('Missing DLQ (PII + retries)**: 1 🔴')) {
    console.log('   🔴 CRITICAL: 1 event missing DLQ configuration');
    console.log('      → user.created: PII events with retries require DLQ');
  }

  if (content.includes('Properly configured DLQs**: 1 ✓')) {
    console.log('   ✅ HEALTHY: 1 event with proper DLQ configuration');
    console.log('      → order.placed: DLQ + retry policy configured correctly');
  }

  if (content.includes('High fanout (>5 subscribers)**: 1')) {
    console.log('   ⚠️  WARNING: 1 event with high fanout (8 subscribers)');
    console.log('      → user.created: 8x retention multiplication risk');
  }

  console.log('\n📈 Statistics:\n');
  console.log(`   • Total events: ${eventManifests.length}`);
  console.log(`   • Transports: kafka (${eventManifests.filter(e => e.delivery?.contract?.transport === 'kafka').length}), amqp (${eventManifests.filter(e => e.delivery?.contract?.transport === 'amqp').length})`);
  console.log(`   • PII-containing: ${eventManifests.filter(e => e.schema?.fields?.some(f => f.pii && f.pii !== 'none')).length}`);
  console.log(`   • Patterns detected: ${eventManifests.reduce((sum, e) => sum + (e.patterns?.detected?.length || 0), 0)}`);

  console.log('\n✅ Event governance generation complete!\n');
  console.log('💡 To generate GOVERNANCE.md in your project:');
  console.log('   npm run governance -- --sections events --diagrams\n');
}

// Run demo
demo().catch(error => {
  console.error('❌ Demo failed:', error);
  process.exit(1);
});
