/**
 * Hash Generator Tests
 * Tests for deterministic hash generation
 */

import { HashGenerator } from '../../packages/protocols/parsers/utils/hash-generator.js';

describe('HashGenerator', () => {
  let generator;

  beforeEach(() => {
    generator = new HashGenerator();
  });

  describe('generate()', () => {
    test('should generate hash for simple object', () => {
      const obj = { foo: 'bar', baz: 123 };
      const hash = generator.generate(obj);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    test('should be deterministic (same input = same hash)', () => {
      const obj = { foo: 'bar', baz: 123 };

      const hash1 = generator.generate(obj);
      const hash2 = generator.generate(obj);

      expect(hash1).toBe(hash2);
    });

    test('should produce different hashes for different objects', () => {
      const obj1 = { foo: 'bar' };
      const obj2 = { foo: 'baz' };

      const hash1 = generator.generate(obj1);
      const hash2 = generator.generate(obj2);

      expect(hash1).not.toBe(hash2);
    });

    test('should produce same hash regardless of key order', () => {
      const obj1 = { a: 1, b: 2, c: 3 };
      const obj2 = { c: 3, a: 1, b: 2 };

      const hash1 = generator.generate(obj1);
      const hash2 = generator.generate(obj2);

      expect(hash1).toBe(hash2);
    });

    test('should handle nested objects', () => {
      const obj = {
        level1: {
          level2: {
            level3: 'deep value'
          }
        }
      };

      const hash = generator.generate(obj);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });

    test('should handle arrays', () => {
      const obj = {
        items: [1, 2, 3, 4, 5],
        nested: [{ a: 1 }, { b: 2 }]
      };

      const hash = generator.generate(obj);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });

    test('should handle null values', () => {
      const obj = { foo: null, bar: 'value' };
      const hash = generator.generate(obj);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });

    test('should handle undefined values', () => {
      const obj = { foo: undefined, bar: 'value' };
      const hash = generator.generate(obj);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });

    test('should handle boolean values', () => {
      const obj = { flag1: true, flag2: false };
      const hash = generator.generate(obj);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });

    test('should handle empty objects', () => {
      const obj = {};
      const hash = generator.generate(obj);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });

    test('should handle empty arrays', () => {
      const obj = { items: [] };
      const hash = generator.generate(obj);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });
  });

  describe('generateFromString()', () => {
    test('should generate hash from string', () => {
      const content = 'Hello, world!';
      const hash = generator.generateFromString(content);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });

    test('should be deterministic for strings', () => {
      const content = 'Test content';

      const hash1 = generator.generateFromString(content);
      const hash2 = generator.generateFromString(content);

      expect(hash1).toBe(hash2);
    });

    test('should produce different hashes for different strings', () => {
      const hash1 = generator.generateFromString('string1');
      const hash2 = generator.generateFromString('string2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verify()', () => {
    test('should verify identical objects', () => {
      const obj1 = { foo: 'bar', baz: 123 };
      const obj2 = { foo: 'bar', baz: 123 };

      const result = generator.verify(obj1, obj2);

      expect(result).toBe(true);
    });

    test('should verify objects with different key order', () => {
      const obj1 = { a: 1, b: 2 };
      const obj2 = { b: 2, a: 1 };

      const result = generator.verify(obj1, obj2);

      expect(result).toBe(true);
    });

    test('should fail for different objects', () => {
      const obj1 = { foo: 'bar' };
      const obj2 = { foo: 'baz' };

      const result = generator.verify(obj1, obj2);

      expect(result).toBe(false);
    });
  });

  describe('generateWithTiming()', () => {
    test('should return hash and duration', () => {
      const obj = { foo: 'bar', baz: 123 };
      const result = generator.generateWithTiming(obj);

      expect(result).toHaveProperty('hash');
      expect(result).toHaveProperty('duration');
      expect(typeof result.hash).toBe('string');
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    test('should complete quickly for small objects', () => {
      const obj = { foo: 'bar' };
      const result = generator.generateWithTiming(obj);

      // Should be very fast for small objects (< 10ms)
      expect(result.duration).toBeLessThan(10);
    });
  });

  describe('performance', () => {
    test('should hash 1000 lines equivalent in < 100ms', () => {
      // Simulate ~1000 lines of OpenAPI spec
      const largeSpec = {
        openapi: '3.0.0',
        info: { title: 'Large API', version: '1.0.0' },
        paths: {}
      };

      // Add 100 paths with 10 operations each
      for (let i = 0; i < 100; i++) {
        largeSpec.paths[`/path${i}`] = {
          get: {
            operationId: `get${i}`,
            summary: `Get ${i}`,
            responses: {
              '200': { description: 'Success' }
            }
          }
        };
      }

      const result = generator.generateWithTiming(largeSpec);

      // Performance target: < 100ms per 1000 lines
      expect(result.duration).toBeLessThan(100);
    });
  });
});
