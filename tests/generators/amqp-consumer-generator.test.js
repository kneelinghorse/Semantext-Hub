/**
 * Tests for AMQP Consumer Generator
 */

import { generateAMQPConsumer } from '../../packages/runtime/generators/consumers/amqp-consumer-generator.js';

describe('AMQP Consumer Generator', () => {
  describe('generateAMQPConsumer', () => {
    it('should generate basic AMQP consumer', () => {
      const manifest = {
        event: { name: 'order.shipped' },
        delivery: {
          contract: {
            transport: 'amqp',
            metadata: {
              exchange: 'orders',
              queue: 'order.shipped',
              routingKey: 'order.shipped'
            }
          }
        },
        schema: { fields: [] },
        semantics: { purpose: 'Notify when order is shipped' }
      };

      const code = generateAMQPConsumer(manifest);

      expect(code).toContain('export class OrderShippedConsumer');
      expect(code).toContain("import * as amqp from 'amqplib'");
      expect(code).toContain("const queue = 'order.shipped'");
      expect(code).toContain("const exchange = 'orders'");
      expect(code).toContain('Notify when order is shipped');
    });

    it('should include PII masking when PII fields exist', () => {
      const manifest = {
        event: { name: 'customer.registered' },
        delivery: {
          contract: {
            transport: 'amqp',
            metadata: {
              queue: 'customer.registered'
            }
          }
        },
        schema: {
          fields: [
            { name: 'email', pii: true },
            { name: 'phone', pii: true }
          ]
        }
      };

      const code = generateAMQPConsumer(manifest);

      expect(code).toContain("import { maskPII } from './utils/pii-masking'");
      expect(code).toContain("maskPII(event, ['email', 'phone'])");
    });

    it('should generate DLQ routing when configured', () => {
      const manifest = {
        event: { name: 'payment.failed' },
        delivery: {
          contract: {
            transport: 'amqp',
            metadata: {
              queue: 'payment.failed'
            },
            dlq: 'payment.dlq'
          }
        },
        schema: { fields: [] }
      };

      const code = generateAMQPConsumer(manifest);

      expect(code).toContain('sendToDLQ');
      expect(code).toContain("const dlqQueue = 'payment.dlq'");
      expect(code).toContain('await this.sendToDLQ(msg, error)');
    });

    it('should use default values when metadata missing', () => {
      const manifest = {
        event: { name: 'simple.event' },
        delivery: {
          contract: {
            transport: 'amqp'
          }
        },
        schema: { fields: [] }
      };

      const code = generateAMQPConsumer(manifest);

      expect(code).toContain("const queue = 'simple.event'"); // Defaults to event name
      expect(code).toContain('durable: true'); // Default durable
      expect(code).toContain('prefetch(1)'); // Default prefetch
    });

    it('should respect durable and prefetch settings', () => {
      const manifest = {
        event: { name: 'temp.event' },
        delivery: {
          contract: {
            transport: 'amqp',
            metadata: {
              queue: 'temp.queue',
              durable: false,
              prefetch: 10
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateAMQPConsumer(manifest);

      expect(code).toContain('durable: false');
      expect(code).toContain('prefetch(10)');
    });

    it('should handle exchange binding correctly', () => {
      const manifest = {
        event: { name: 'notification.sent' },
        delivery: {
          contract: {
            transport: 'amqp',
            metadata: {
              exchange: 'notifications',
              queue: 'notification.sent',
              routingKey: 'notification.*'
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateAMQPConsumer(manifest);

      expect(code).toContain("const exchange = 'notifications'");
      expect(code).toContain('assertExchange');
      expect(code).toContain('bindQueue');
      expect(code).toContain("'notification.*'");
    });

    it('should generate JavaScript when typescript option is false', () => {
      const manifest = {
        event: { name: 'test.event' },
        delivery: {
          contract: {
            transport: 'amqp',
            metadata: {
              queue: 'test.queue'
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateAMQPConsumer(manifest, { typescript: false });

      expect(code).not.toContain(': amqp.Connection');
      expect(code).not.toContain(': amqp.Channel');
      expect(code).not.toContain('private ');
    });
  });
});
