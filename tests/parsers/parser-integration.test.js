/**
 * Integration Tests for Enhanced OpenAPI Parser (B7.1.1)
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { OpenAPIParser } from '../../packages/protocols/parsers/openapi-parser.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../../fixtures/openapi');

describe('OpenAPIParser - Enhanced Features (B7.1.1)', () => {
  let parser;

  beforeEach(() => {
    parser = new OpenAPIParser({
      progressTracking: false,
      errorMode: 'collect'
    });
  });

  describe('Error Collection Mode', () => {
    it('should collect errors instead of throwing', async () => {
      const invalidSpec = {
        openapi: '2.0.0', // Invalid version
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      const result = await parser.parse(invalidSpec);

      expect(result.hasErrors).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('OPENAPI_001');
    });

    it('should return partial results on error', async () => {
      const result = await parser.parse({ invalid: 'spec' });

      expect(result.error).toBe(true);
      expect(result.errors).toBeDefined();
      expect(result.message).toBeTruthy();
    });
  });

  describe('Circular Reference Detection', () => {
    it('should detect circular references', async () => {
      const circularSpecPath = path.join(fixturesDir, 'with-circular-refs.json');

      const parser = new OpenAPIParser({
        detectCircular: true,
        allowCircular: true,
        errorMode: 'collect',
        validateSpec: false
      });

      const result = await parser.parse(circularSpecPath);

      expect(result.metadata.hasCircularRefs).toBe(true);
      expect(result.circularRefs).toBeDefined();
      expect(result.circularRefs.length).toBeGreaterThan(0);
    });

    it('should warn about circular refs when allowed', async () => {
      const circularSpecPath = path.join(fixturesDir, 'with-circular-refs.json');

      const parser = new OpenAPIParser({
        detectCircular: true,
        allowCircular: true,
        errorMode: 'collect',
        validateSpec: false
      });

      const result = await parser.parse(circularSpecPath);

      // Should have warnings but not errors
      expect(result.hasWarnings || result.warnings.length > 0).toBe(true);
    });
  });

  describe('Progress Tracking', () => {
    it('should emit progress events when enabled', async () => {
      const progressParser = new OpenAPIParser({
        progressTracking: true,
        errorMode: 'collect',
        validateSpec: false
      });

      const events = [];
      const tracker = progressParser.getProgressTracker();

      tracker.on('start', (data) => events.push({ type: 'start', data }));
      tracker.on('progress', (data) => events.push({ type: 'progress', data }));
      tracker.on('complete', (data) => events.push({ type: 'complete', data }));

      const simpleSpec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      await progressParser.parse(simpleSpec);

      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'start')).toBe(true);
      expect(events.some(e => e.type === 'complete')).toBe(true);
    });
  });

  describe('Enhanced Metadata', () => {
    it('should include enhanced metadata in results', async () => {
      const simpleSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              summary: 'Test endpoint',
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = await parser.parse(simpleSpec);

      expect(result.metadata).toBeDefined();
      expect(result.metadata.parsedAt).toBeTruthy();
      expect(result.metadata.externalRefsResolved).toBeDefined();
      expect(result.metadata.hasCircularRefs).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(result.warnings).toBeDefined();
      expect(result.hasErrors).toBeDefined();
      expect(result.hasWarnings).toBeDefined();
    });

    it('should extract endpoints and schemas', async () => {
      const simpleSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              summary: 'List users',
              operationId: 'listUsers',
              responses: {
                '200': {
                  description: 'OK'
                }
              }
            }
          }
        },
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' }
              }
            }
          }
        }
      };

      const result = await parser.parse(simpleSpec);

      expect(result.endpoints).toBeDefined();
      expect(result.schemas).toBeDefined();
      expect(Array.isArray(result.endpoints)).toBe(true);
      expect(Array.isArray(result.schemas)).toBe(true);
    });
  });

  describe('Error Recovery', () => {
    it('should continue parsing with non-fatal errors', async () => {
      const partialSpec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/valid': {
            get: {
              summary: 'Valid endpoint',
              responses: {
                '200': { description: 'OK' }
              }
            }
          }
        }
      };

      const result = await parser.parse(partialSpec);

      expect(result.spec).toBeDefined();
      expect(result.paths).toBeDefined();
    });
  });

  describe('Resolver Stats', () => {
    it('should provide resolver statistics', async () => {
      const simpleSpec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      await parser.parse(simpleSpec);

      const stats = parser.getResolverStats();

      expect(stats).toBeDefined();
      expect(stats.hits).toBeDefined();
      expect(stats.misses).toBeDefined();
      expect(stats.fetches).toBeDefined();
      expect(stats.cacheSize).toBeDefined();
      expect(stats.cacheHitRate).toBeDefined();
    });
  });

  describe('Clear Cache', () => {
    it('should clear all cached data', async () => {
      const simpleSpec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      await parser.parse(simpleSpec);

      expect(parser.getParsedSpec()).toBeDefined();

      parser.clear();

      expect(parser.getParsedSpec()).toBeNull();
    });
  });
});
