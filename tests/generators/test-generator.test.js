/**
 * Tests for Test Scaffold Generator
 */

import { generateConsumerTest } from '../../packages/runtime/generators/consumers/test-generator.js';

describe('Test Scaffold Generator', () => {
  describe('generateConsumerTest', () => {
    it('should generate basic Kafka test scaffold', () => {
      const manifest = {
        event: { name: 'user.created' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'users.created'
          }
        },
        schema: { fields: [] }
      };

      const code = generateConsumerTest(manifest);

      expect(code).toContain("import { UserCreatedConsumer } from './user.created-consumer'");
      expect(code).toContain("describe('UserCreatedConsumer'");
      expect(code).toContain("brokers: ['localhost:9092'], groupId: 'test-group'");
      expect(code).toContain("it('should process valid event'");
      expect(code).toContain("it('should handle malformed message'");
    });

    it('should generate basic AMQP test scaffold', () => {
      const manifest = {
        event: { name: 'order.shipped' },
        delivery: {
          contract: {
            transport: 'amqp',
            metadata: {
              queue: 'order.shipped'
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateConsumerTest(manifest);

      expect(code).toContain("import { OrderShippedConsumer } from './order.shipped-consumer'");
      expect(code).toContain("connectionUrl: 'amqp://localhost'");
      expect(code).toContain('Mock amqplib connection');
    });

    it('should generate basic MQTT test scaffold', () => {
      const manifest = {
        event: { name: 'sensor.reading' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'sensors/temp'
          }
        },
        schema: { fields: [] }
      };

      const code = generateConsumerTest(manifest);

      expect(code).toContain("import { SensorReadingConsumer } from './sensor.reading-consumer'");
      expect(code).toContain("brokerUrl: 'mqtt://localhost:1883'");
      expect(code).toContain('Mock MQTT.js client');
    });

    it('should include PII masking test when PII fields exist', () => {
      const manifest = {
        event: { name: 'user.registered' },
        delivery: {
          contract: {
            transport: 'kafka'
          }
        },
        schema: {
          fields: [
            { name: 'email', pii: true },
            { name: 'name', pii: true }
          ]
        }
      };

      const code = generateConsumerTest(manifest);

      expect(code).toContain("it('should mask PII in logs'");
      expect(code).toContain('email, name');
    });

    it('should include DLQ test when DLQ configured', () => {
      const manifest = {
        event: { name: 'payment.processed' },
        delivery: {
          contract: {
            transport: 'kafka',
            dlq: 'payment.dlq'
          }
        },
        schema: { fields: [] }
      };

      const code = generateConsumerTest(manifest);

      expect(code).toContain("it('should route failed messages to DLQ'");
      expect(code).toContain('payment.dlq');
    });

    it('should include connection lifecycle test', () => {
      const manifest = {
        event: { name: 'test.event' },
        delivery: {
          contract: {
            transport: 'kafka'
          }
        },
        schema: { fields: [] }
      };

      const code = generateConsumerTest(manifest);

      expect(code).toContain("it('should connect and disconnect cleanly'");
      expect(code).toContain('await consumer.start()');
      expect(code).toContain('await consumer.stop()');
    });

    it('should include test strategy comments', () => {
      const manifest = {
        event: { name: 'test.event' },
        delivery: {
          contract: {
            transport: 'kafka'
          }
        },
        schema: { fields: [] }
      };

      const code = generateConsumerTest(manifest);

      expect(code).toContain('Test strategy:');
      expect(code).toContain('Unit tests with mocked transport clients');
      expect(code).toContain('Integration tests with testcontainers');
    });

    it('should generate TypeScript test by default', () => {
      const manifest = {
        event: { name: 'test.event' },
        delivery: {
          contract: {
            transport: 'kafka'
          }
        },
        schema: { fields: [] }
      };

      const code = generateConsumerTest(manifest);

      expect(code).toContain(': TestEventConsumer');
    });

    it('should generate JavaScript test when typescript option is false', () => {
      const manifest = {
        event: { name: 'test.event' },
        delivery: {
          contract: {
            transport: 'kafka'
          }
        },
        schema: { fields: [] }
      };

      const code = generateConsumerTest(manifest, { typescript: false });

      expect(code).not.toContain(': TestEventConsumer');
      expect(code).toContain('let consumer');
    });
  });
});
