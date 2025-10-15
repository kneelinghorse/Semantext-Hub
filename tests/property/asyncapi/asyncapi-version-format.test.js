import { describe, it, expect } from '@jest/globals';
import { generateRandomAsyncAPI } from '../../fixtures/generated/asyncapi/property-generator.js';

describe('AsyncAPI Property Tests', () => {
  it('should always have valid version format', async () => {
    for (let i = 0; i < 100; i++) {
      const spec = generateRandomAsyncAPI();
      expect(spec.asyncapi).toMatch(/^2\.\d+\.\d+$/);
    }
  });

  it('should always have required info fields', async () => {
    for (let i = 0; i < 100; i++) {
      const spec = generateRandomAsyncAPI();
      expect(spec.info).toBeDefined();
      expect(spec.info.title).toBeDefined();
      expect(spec.info.version).toBeDefined();
      expect(typeof spec.info.title).toBe('string');
      expect(typeof spec.info.version).toBe('string');
    }
  });

  it('should always have valid channels structure', async () => {
    for (let i = 0; i < 100; i++) {
      const spec = generateRandomAsyncAPI();
      expect(spec.channels).toBeDefined();
      expect(typeof spec.channels).toBe('object');
      
      for (const [channelName, channel] of Object.entries(spec.channels)) {
        expect(typeof channelName).toBe('string');
        expect(typeof channel).toBe('object');
        expect(channel.publish || channel.subscribe).toBeDefined();
      }
    }
  });

  it('should always have valid message payloads', async () => {
    for (let i = 0; i < 100; i++) {
      const spec = generateRandomAsyncAPI();
      
      for (const [channelName, channel] of Object.entries(spec.channels)) {
        if (channel.publish?.message?.payload) {
          expect(typeof channel.publish.message.payload).toBe('object');
        }
        if (channel.subscribe?.message?.payload) {
          expect(typeof channel.subscribe.message.payload).toBe('object');
        }
      }
    }
  });
});