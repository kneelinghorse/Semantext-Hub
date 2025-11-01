import { describe, expect, test, jest } from '@jest/globals';

import { RedisEventPublisher } from '../../../packages/runtime/events/event-publisher.js';
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

describe('RedisEventPublisher', () => {
  test('publishes structured events to Redis Streams', async () => {
    const redis = new MockRedis();

    const publisher = new RedisEventPublisher({
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

    const messageId = await publisher.publish({
      streamSegments: {
        objectId: 'search-service'
      },
      eventType: 'ToolActivated',
      source: 'tests.tool_hub',
      payload: {
        urn: 'urn:test:tool:alpha',
        metadata: { name: 'Alpha Tool' }
      },
      tags: ['alpha', 'activation'],
      correlationId: 'corr-123'
    });

    expect(messageId).toBeTruthy();

    const streamName = 'test:demo:tool:activated:search-service';
    const entries = redis.streams.get(streamName);
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    const metadataIndex = entry.fields.indexOf('metadata');
    const payloadIndex = entry.fields.indexOf('payload');
    const metadata = JSON.parse(entry.fields[metadataIndex + 1]);
    const payload = JSON.parse(entry.fields[payloadIndex + 1]);

    expect(metadata.eventType).toBe('ToolActivated');
    expect(metadata.source).toBe('tests.tool_hub');
    expect(metadata.correlationId).toBe('corr-123');
    expect(Array.isArray(metadata.tags)).toBe(true);
    expect(payload.urn).toBe('urn:test:tool:alpha');
    expect(payload.metadata.name).toBe('Alpha Tool');
  });

  test('degrades gracefully when Redis connection fails', async () => {
    const errorLogger = {
      ...noopLogger,
      warn: jest.fn(),
      error: jest.fn()
    };

    const publisher = new RedisEventPublisher({
      createRedisClient: () => {
        throw new Error('ECONNREFUSED mock redis down');
      },
      redisUrl: 'redis://mock',
      logger: errorLogger
    });

    const result = await publisher.publish({
      streamSegments: {
        object: 'tool',
        event: 'activated',
        objectId: 'beta'
      },
      eventType: 'ToolActivated',
      source: 'tests.tool_hub',
      payload: { urn: 'urn:test:tool:beta' }
    });

    expect(result).toBeNull();
    expect(errorLogger.warn).toHaveBeenCalled();
  });
});
