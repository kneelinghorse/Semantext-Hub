import { describe, it, expect } from '@jest/globals';
import { generateRandomOpenAPI } from '../../fixtures/generated/openapi/property-generator.js';

describe('OpenAPI Property Tests', () => {
  it('should always have valid version format', async () => {
    for (let i = 0; i < 100; i++) {
      const spec = generateRandomOpenAPI();
      expect(spec.openapi).toMatch(/^3\.0\.\d+$/);
    }
  });

  it('should always have required info fields', async () => {
    for (let i = 0; i < 100; i++) {
      const spec = generateRandomOpenAPI();
      expect(spec.info).toBeDefined();
      expect(spec.info.title).toBeDefined();
      expect(spec.info.version).toBeDefined();
      expect(typeof spec.info.title).toBe('string');
      expect(typeof spec.info.version).toBe('string');
    }
  });

  it('should always have valid paths structure', async () => {
    for (let i = 0; i < 100; i++) {
      const spec = generateRandomOpenAPI();
      expect(spec.paths).toBeDefined();
      expect(typeof spec.paths).toBe('object');
      
      for (const [path, methods] of Object.entries(spec.paths)) {
        expect(path).toMatch(/^\//);
        expect(typeof methods).toBe('object');
      }
    }
  });

  it('should always have valid HTTP methods', async () => {
    const validMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
    
    for (let i = 0; i < 100; i++) {
      const spec = generateRandomOpenAPI();
      
      for (const [path, methods] of Object.entries(spec.paths)) {
        for (const method of Object.keys(methods)) {
          expect(validMethods).toContain(method.toLowerCase());
        }
      }
    }
  });
});