import { describe, expect, test, beforeEach, jest } from '@jest/globals';

import { RedisEventPublisher } from '../../../packages/runtime/events/event-publisher.js';
import { RedisEventConsumer } from '../../../packages/runtime/events/event-consumer.js';
import { MockRedis } from './helpers/mock-redis.js';

const noopLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child() {
    return this;
  }
};

describe('RedisEventConsumer', () => {
  let redis;
  let publisher;
  let consumer;

  beforeEach(() => {
    redis = new MockRedis();
    publisher = new RedisEventPublisher({
      createRedisClient: () => redis,
      redisUrl: 'redis://mock',
      logger: noopLogger,
      streamDefaults: {
        env: 'test',
        domain: 'demo',
        object: 'tool',
        event: 'activated'
      }
    });

    consumer = new RedisEventConsumer({
      createRedisClient: () => redis,
      redisUrl: 'redis://mock',
      logger: noopLogger,
      streamDefaults: {
        env: 'test',
        domain: 'demo',
        object: 'tool',
        event: 'activated'
      }
    });
  });

  test('reads and acknowledges messages via consumer groups', async () => {
    await consumer.ensureGroup({
      group: 'workers',
      streamSegments: { objectId: 'omega-tool' }
    });

    await publisher.publish({
      streamSegments: { objectId: 'omega-tool' },
      eventType: 'ToolActivated',
      source: 'tests.tool_hub',
      payload: { urn: 'urn:test:tool:omega' }
    });

    const messages = await consumer.read({
      group: 'workers',
      consumer: 'worker-1',
      streamSegments: { objectId: 'omega-tool' },
      count: 5,
      blockMs: 0
    });

    expect(messages).toHaveLength(1);
    const [message] = messages;
    expect(message.stream).toBe('test:demo:tool:activated:omega-tool');
    expect(message.payload.urn).toBe('urn:test:tool:omega');
    expect(message.metadata.eventType).toBe('ToolActivated');

    const ack = await consumer.acknowledge({
      streamSegments: { objectId: 'omega-tool' },
      group: 'workers',
      id: message.id
    });

    expect(ack).toBe(true);
  });
});
