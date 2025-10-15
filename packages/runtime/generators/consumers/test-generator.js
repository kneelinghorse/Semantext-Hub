/**
 * Test Scaffold Generator
 * Generates test scaffolds for event consumers
 */

const { toClassName } = require('./kafka-consumer-generator');

/**
 * Generate test scaffold for consumer
 * @param {object} manifest - Event Protocol manifest
 * @param {object} options - Generation options
 * @param {boolean} options.typescript - Generate TypeScript (default: true)
 * @returns {string} - Generated test code
 */
function generateConsumerTest(manifest, options = {}) {
  const { typescript = true } = options;

  const eventName = manifest.event?.name || 'UnknownEvent';
  const className = toClassName(eventName);
  const transport = manifest.delivery?.contract?.transport || 'kafka';
  const piiFields = manifest.schema?.fields?.filter(f => f.pii) || [];
  const hasDLQ = !!manifest.delivery?.contract?.dlq;

  // Build config based on transport
  let consumerConfig;
  let mockSetup;

  if (transport === 'kafka') {
    consumerConfig = `brokers: ['localhost:9092'], groupId: 'test-group'`;
    mockSetup = `    // TODO: Mock KafkaJS consumer
    // Consider using testcontainers for integration tests`;
  } else if (transport === 'amqp') {
    consumerConfig = `connectionUrl: 'amqp://localhost'`;
    mockSetup = `    // TODO: Mock amqplib connection
    // Consider using testcontainers for integration tests`;
  } else if (transport === 'mqtt') {
    consumerConfig = `brokerUrl: 'mqtt://localhost:1883'`;
    mockSetup = `    // TODO: Mock MQTT.js client
    // Consider using testcontainers for integration tests`;
  } else {
    consumerConfig = `/* TODO: Add config for ${transport} */`;
    mockSetup = `    // TODO: Mock ${transport} client`;
  }

  // Build test cases
  const testCases = [];

  // Basic processing test
  testCases.push(`  it('should process valid event', async () => {
${mockSetup}
    // TODO: Implement test with mock message
  });`);

  // Error handling test
  testCases.push(`  it('should handle malformed message', async () => {
    // TODO: Implement error handling test
  });`);

  // PII masking test (if applicable)
  if (piiFields.length > 0) {
    testCases.push(`  it('should mask PII in logs', async () => {
    // TODO: Verify PII masking for fields: [${piiFields.map(f => f.name).join(', ')}]
    // Ensure these fields are redacted in logs
  });`);
  }

  // DLQ routing test (if applicable)
  if (hasDLQ) {
    testCases.push(`  it('should route failed messages to DLQ', async () => {
    // TODO: Verify DLQ routing to: ${manifest.delivery.contract.dlq}
  });`);
  }

  // Connection test
  testCases.push(`  it('should connect and disconnect cleanly', async () => {
    await consumer.start();
    await consumer.stop();
    // Verify no hanging connections
  });`);

  return `import { ${className}Consumer } from './${eventName}-consumer';

/**
 * Tests for ${className}Consumer
 *
 * Test strategy:
 * - Unit tests with mocked transport clients
 * - Integration tests with testcontainers (recommended)
 * - PII masking verification
 * - Error handling and DLQ routing
 */
describe('${className}Consumer', () => {
  let consumer${typescript ? ': ' + className + 'Consumer' : ''};

  beforeEach(() => {
    // Setup consumer with test configuration
    consumer = new ${className}Consumer({
      ${consumerConfig}
    });
  });

  afterEach(async () => {
    await consumer.stop();
  });

${testCases.join('\n\n')}
});
`;
}

module.exports = { generateConsumerTest };
