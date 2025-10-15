/**
 * Tests for Kafka Consumer Generator
 */

import { generateKafkaConsumer, toClassName } from '../../packages/runtime/generators/consumers/kafka-consumer-generator.js';

describe('Kafka Consumer Generator', () => {
  describe('toClassName', () => {
    it('should convert event names to class names', () => {
      expect(toClassName('user.created')).toBe('UserCreated');
      expect(toClassName('order-shipped')).toBe('OrderShipped');
      expect(toClassName('payment_processed')).toBe('Payment_processed');
    });

    it('should handle single word names', () => {
      expect(toClassName('event')).toBe('Event');
    });
  });

  describe('generateKafkaConsumer', () => {
    it('should generate basic Kafka consumer', () => {
      const manifest = {
        event: { name: 'user.created' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'users.created'
          }
        },
        schema: { fields: [] },
        semantics: { purpose: 'Notify when user is created' }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain('export class UserCreatedConsumer');
      expect(code).toContain("import { Kafka, Consumer, EachMessagePayload } from 'kafkajs'");
      expect(code).toContain("topic: 'users.created'");
      expect(code).toContain('Notify when user is created');
    });

    it('should include PII masking imports when PII fields exist', () => {
      const manifest = {
        event: { name: 'user.registered' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'users.registered'
          }
        },
        schema: {
          fields: [
            { name: 'email', pii: true },
            { name: 'name', pii: true }
          ]
        }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain("import { maskPII } from './utils/pii-masking'");
      expect(code).toContain("maskPII(event, ['email', 'name'])");
    });

    it('should generate DLQ routing when DLQ configured', () => {
      const manifest = {
        event: { name: 'payment.processed' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'payments.processed',
            dlq: 'payments.dlq'
          }
        },
        schema: { fields: [] }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain('sendToDLQ');
      expect(code).toContain("topic: 'payments.dlq'");
      expect(code).toContain('await this.sendToDLQ(payload, error)');
    });

    it('should include warning when DLQ missing', () => {
      const manifest = {
        event: { name: 'order.created' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'orders.created'
          }
        },
        schema: { fields: [] },
        patterns: {
          detected: [
            {
              pattern: 'missing_dlq',
              message: 'No DLQ configured for event stream'
            }
          ]
        }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain('⚠️ WARNING: No DLQ configured for event stream');
      expect(code).toContain('⚠️ No DLQ configured - message will be retried or lost');
    });

    it('should include ordering pattern comments', () => {
      const manifest = {
        event: { name: 'user.updated' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'users.updated'
          }
        },
        schema: { fields: [] },
        patterns: {
          detected: [
            {
              pattern: 'user_keyed_ordering',
              message: 'Messages partitioned by userId for ordering'
            }
          ]
        }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain('ℹ️ Ordering: Messages partitioned by userId for ordering');
    });

    it('should generate JavaScript when typescript option is false', () => {
      const manifest = {
        event: { name: 'test.event' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'test.topic'
          }
        },
        schema: { fields: [] }
      };

      const code = generateKafkaConsumer(manifest, { typescript: false });

      // TypeScript annotations should not be present
      expect(code).not.toContain(': Kafka');
      expect(code).not.toContain(': Consumer');
      expect(code).not.toContain(': EachMessagePayload');
      expect(code).not.toContain('private ');
    });

    it('should handle manifests without optional fields', () => {
      const manifest = {
        event: { name: 'minimal.event' },
        delivery: {
          contract: {
            transport: 'kafka'
          }
        }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain('export class MinimalEventConsumer');
      expect(code).toContain("topic: 'minimal.event'"); // Fallback to event name
    });
  });
});
