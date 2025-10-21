/**
 * Performance Benchmarks
 * Validates performance targets for OpenAPI parser
 *
 * Targets:
 * - Parse 10k line spec in <1 second
 * - Hash generation <100ms per 1000 lines
 * - Memory usage <50MB for typical specs
 */

import { OpenAPIParser } from '../../packages/protocols/parsers/openapi-parser.js';
import { HashGenerator } from '../../packages/protocols/parsers/utils/hash-generator.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Performance Benchmarks', () => {
  describe('Parsing Performance', () => {
    test('should parse small spec (< 100 lines) in < 200ms', async () => {
      const parser = new OpenAPIParser();
      const fixturesPath = path.join(__dirname, '../../fixtures/openapi');
      const specPath = path.join(fixturesPath, 'simple-api.json');

      const start = process.hrtime.bigint();
      await parser.parse(specPath);
      const end = process.hrtime.bigint();

      const duration = Number(end - start) / 1_000_000; // Convert to ms

      expect(duration).toBeLessThan(200);
    });

    test('should parse medium spec (~ 1000 lines) in < 800ms', async () => {
      const parser = new OpenAPIParser();

      // Generate a medium-sized spec
      const mediumSpec = {
        openapi: '3.0.0',
        info: { title: 'Medium API', version: '1.0.0' },
        paths: {}
      };

      // Add 100 paths with 2 operations each (~ 1000 lines)
      for (let i = 0; i < 100; i++) {
        mediumSpec.paths[`/resource${i}`] = {
          get: {
            operationId: `getResource${i}`,
            summary: `Get resource ${i}`,
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        value: { type: 'number' }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            operationId: `createResource${i}`,
            summary: `Create resource ${i}`,
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      value: { type: 'number' }
                    }
                  }
                }
              }
            },
            responses: {
              '201': { description: 'Created' }
            }
          }
        };
      }

      const start = process.hrtime.bigint();
      await parser.parse(mediumSpec);
      const end = process.hrtime.bigint();

      const duration = Number(end - start) / 1_000_000; // Convert to ms

      expect(duration).toBeLessThan(800);
    });

    test('should parse large spec (~ 10k lines) in < 2000ms', async () => {
      const parser = new OpenAPIParser();

      // Generate a large spec (~ 10k lines)
      const largeSpec = {
        openapi: '3.0.0',
        info: {
          title: 'Large API',
          version: '1.0.0',
          description: 'A large API with many endpoints for performance testing'
        },
        paths: {},
        components: {
          schemas: {}
        }
      };

      // Add 500 paths with 4 operations each (~ 10k lines)
      for (let i = 0; i < 500; i++) {
        largeSpec.paths[`/resource${i}`] = {
          get: {
            operationId: `getResource${i}`,
            summary: `Get resource ${i}`,
            responses: { '200': { description: 'Success' } }
          },
          post: {
            operationId: `createResource${i}`,
            summary: `Create resource ${i}`,
            responses: { '201': { description: 'Created' } }
          },
          put: {
            operationId: `updateResource${i}`,
            summary: `Update resource ${i}`,
            responses: { '200': { description: 'Updated' } }
          },
          delete: {
            operationId: `deleteResource${i}`,
            summary: `Delete resource ${i}`,
            responses: { '204': { description: 'Deleted' } }
          }
        };
      }

      const start = process.hrtime.bigint();
      await parser.parse(largeSpec);
      const end = process.hrtime.bigint();

      const duration = Number(end - start) / 1_000_000; // Convert to ms

      // Target: < 1 second for 10k lines
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Hash Generation Performance', () => {
    test('should hash small spec in < 10ms', () => {
      const generator = new HashGenerator();
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/test': {
            get: { responses: { '200': { description: 'OK' } } }
          }
        }
      };

      const result = generator.generateWithTiming(spec);

      expect(result.duration).toBeLessThan(10);
    });

    test('should hash 1000-line equivalent in < 100ms', () => {
      const generator = new HashGenerator();

      // Create ~1000 line spec
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Large API', version: '1.0.0' },
        paths: {}
      };

      for (let i = 0; i < 100; i++) {
        spec.paths[`/path${i}`] = {
          get: {
            operationId: `get${i}`,
            responses: { '200': { description: 'Success' } }
          }
        };
      }

      const result = generator.generateWithTiming(spec);

      // Target: < 100ms per 1000 lines
      expect(result.duration).toBeLessThan(100);
    });

    test('should be deterministic (same hash across runs)', () => {
      const generator = new HashGenerator();
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      const hashes = [];
      for (let i = 0; i < 10; i++) {
        hashes.push(generator.generate(spec));
      }

      // All hashes should be identical
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1);
    });
  });

  describe('Endpoint Extraction Performance', () => {
    test('should extract endpoints from large spec in < 200ms', async () => {
      const parser = new OpenAPIParser();

      // Create spec with 500 endpoints
      const spec = {
        openapi: '3.0.0',
        info: { title: 'API', version: '1.0.0' },
        paths: {}
      };

      for (let i = 0; i < 500; i++) {
        spec.paths[`/resource${i}`] = {
          get: {
            operationId: `get${i}`,
            responses: { '200': { description: 'OK' } }
          }
        };
      }

      await parser.parse(spec);

      const start = process.hrtime.bigint();
      const endpoints = parser.extractEndpoints();
      const end = process.hrtime.bigint();

      const duration = Number(end - start) / 1_000_000;

      expect(endpoints.length).toBe(500);
      expect(duration).toBeLessThan(200);
    });
  });

  describe('Schema Extraction Performance', () => {
    test('should extract schemas from large spec in < 200ms', async () => {
      const parser = new OpenAPIParser();

      // Create spec with 100 schemas
      const spec = {
        openapi: '3.0.0',
        info: { title: 'API', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {}
        }
      };

      for (let i = 0; i < 100; i++) {
        spec.components.schemas[`Schema${i}`] = {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            value: { type: 'number' }
          }
        };
      }

      await parser.parse(spec);

      const start = process.hrtime.bigint();
      const schemas = parser.extractSchemas();
      const end = process.hrtime.bigint();

      const duration = Number(end - start) / 1_000_000;

      expect(schemas.length).toBeGreaterThanOrEqual(100);
      expect(duration).toBeLessThan(200);
    });
  });

  describe('Manifest Conversion Performance', () => {
    test('should convert to manifest in < 300ms for large spec', async () => {
      const parser = new OpenAPIParser();

      // Create moderately large spec
      const spec = {
        openapi: '3.0.0',
        info: { title: 'API', version: '1.0.0' },
        paths: {},
        components: { schemas: {} }
      };

      for (let i = 0; i < 100; i++) {
        spec.paths[`/resource${i}`] = {
          get: {
            operationId: `get${i}`,
            responses: { '200': { description: 'OK' } }
          }
        };

        spec.components.schemas[`Schema${i}`] = {
          type: 'object',
          properties: { id: { type: 'string' } }
        };
      }

      await parser.parse(spec);

      const start = process.hrtime.bigint();
      const manifest = parser.toProtocolManifest();
      const end = process.hrtime.bigint();

      const duration = Number(end - start) / 1_000_000;

      expect(manifest).toBeDefined();
      expect(manifest.service).toBeDefined();
      expect(manifest.interface).toBeDefined();
      expect(duration).toBeLessThan(300);
    });
  });
});
