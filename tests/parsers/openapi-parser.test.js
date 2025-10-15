/**
 * OpenAPI Parser Tests
 * Tests for the core OpenAPI parser functionality
 */

import { OpenAPIParser } from '../../packages/protocols/parsers/openapi-parser.js';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('OpenAPIParser', () => {
  let parser;
  const fixturesPath = path.join(__dirname, '../../fixtures/openapi');

  beforeEach(() => {
    parser = new OpenAPIParser();
  });

  afterEach(() => {
    parser.clear();
  });

  describe('parse()', () => {
    test('should parse a simple OpenAPI spec from file', async () => {
      const specPath = path.join(fixturesPath, 'simple-api.json');
      const result = await parser.parse(specPath);

      expect(result).toBeDefined();
      expect(result.version).toBe('3.0.3');
      expect(result.info.title).toBe('Simple Test API');
      expect(result.info.version).toBe('1.0.0');
      expect(result.paths).toBeDefined();
      expect(Object.keys(result.paths).length).toBeGreaterThan(0);
    });

    test('should parse OpenAPI spec from object', async () => {
      const spec = {
        openapi: '3.0.0',
        info: {
          title: 'Test API',
          version: '1.0.0'
        },
        paths: {
          '/test': {
            get: {
              operationId: 'getTest',
              responses: {
                '200': {
                  description: 'Success'
                }
              }
            }
          }
        }
      };

      const result = await parser.parse(spec);

      expect(result).toBeDefined();
      expect(result.version).toBe('3.0.0');
      expect(result.info.title).toBe('Test API');
    });

    test('should parse OpenAPI spec from JSON string', async () => {
      const specString = JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      });

      const result = await parser.parse(specString);

      expect(result).toBeDefined();
      expect(result.version).toBe('3.0.0');
    });

    test('should reject unsupported OpenAPI versions', async () => {
      parser = new OpenAPIParser({ strictMode: true });

      const spec = {
        swagger: '2.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      await expect(parser.parse(spec)).rejects.toThrow(/Unsupported OpenAPI version/);
    });

    test('should reject specs without version field', async () => {
      parser = new OpenAPIParser({ strictMode: true });

      const spec = {
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      await expect(parser.parse(spec)).rejects.toThrow(/missing openapi/);
    });

    test('should generate hash when enabled', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      const result = await parser.parse(spec);

      expect(result.hash).toBeDefined();
      expect(typeof result.hash).toBe('string');
      expect(result.hash.length).toBeGreaterThan(0);
    });

    test('should not generate hash when disabled', async () => {
      parser = new OpenAPIParser({ generateHash: false });

      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      const result = await parser.parse(spec);

      expect(result.hash).toBeUndefined();
    });

    test('should include metadata', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      const result = await parser.parse(spec);

      expect(result.metadata).toBeDefined();
      expect(result.metadata.parsedAt).toBeDefined();
      expect(result.metadata.sourceType).toBe('object');
    });
  });

  describe('extractEndpoints()', () => {
    test('should extract endpoints from parsed spec', async () => {
      const specPath = path.join(fixturesPath, 'simple-api.json');
      await parser.parse(specPath);

      const endpoints = parser.extractEndpoints();

      expect(endpoints).toBeDefined();
      expect(Array.isArray(endpoints)).toBe(true);
      expect(endpoints.length).toBeGreaterThan(0);

      // Check first endpoint structure
      const firstEndpoint = endpoints[0];
      expect(firstEndpoint).toHaveProperty('method');
      expect(firstEndpoint).toHaveProperty('path');
    });

    test('should extract endpoint metadata', async () => {
      const specPath = path.join(fixturesPath, 'simple-api.json');
      await parser.parse(specPath);

      const endpoints = parser.extractEndpoints();
      const getUserEndpoint = endpoints.find(e => e.operationId === 'getUser');

      expect(getUserEndpoint).toBeDefined();
      expect(getUserEndpoint.method).toBe('GET');
      expect(getUserEndpoint.path).toBe('/users/{userId}');
      expect(getUserEndpoint.summary).toBe('Get user by ID');
      expect(getUserEndpoint.tags).toContain('users');
    });

    test('should extract parameters correctly', async () => {
      const specPath = path.join(fixturesPath, 'simple-api.json');
      await parser.parse(specPath);

      const endpoints = parser.extractEndpoints();
      const listUsersEndpoint = endpoints.find(e => e.operationId === 'listUsers');

      expect(listUsersEndpoint).toBeDefined();
      expect(listUsersEndpoint.parameters).toBeDefined();
      expect(listUsersEndpoint.parameters.length).toBeGreaterThan(0);

      const pageParam = listUsersEndpoint.parameters.find(p => p.name === 'page');
      expect(pageParam).toBeDefined();
      expect(pageParam.in).toBe('query');
      expect(pageParam.required).toBe(false);
    });

    test('should throw error if no spec is parsed', () => {
      expect(() => parser.extractEndpoints()).toThrow(/No spec available/);
    });
  });

  describe('extractSchemas()', () => {
    test('should extract schemas from parsed spec', async () => {
      const specPath = path.join(fixturesPath, 'simple-api.json');
      await parser.parse(specPath);

      const schemas = parser.extractSchemas();

      expect(schemas).toBeDefined();
      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.length).toBeGreaterThan(0);
    });

    test('should extract schema metadata', async () => {
      const specPath = path.join(fixturesPath, 'simple-api.json');
      await parser.parse(specPath);

      const schemas = parser.extractSchemas();
      const userSchema = schemas.find(s => s.name === 'User');

      expect(userSchema).toBeDefined();
      expect(userSchema.type).toBe('object');
      expect(userSchema.required).toContain('id');
      expect(userSchema.required).toContain('email');
      expect(userSchema.properties).toBeDefined();
      expect(userSchema.properties.email).toBeDefined();
    });

    test('should throw error if no spec is parsed', () => {
      expect(() => parser.extractSchemas()).toThrow(/No spec available/);
    });
  });

  describe('generateSpecHash()', () => {
    test('should generate deterministic hash', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      const hash1 = parser.generateSpecHash(spec);
      const hash2 = parser.generateSpecHash(spec);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBeGreaterThan(0);
    });

    test('should generate different hashes for different specs', () => {
      const spec1 = {
        openapi: '3.0.0',
        info: { title: 'Test1', version: '1.0.0' },
        paths: {}
      };

      const spec2 = {
        openapi: '3.0.0',
        info: { title: 'Test2', version: '1.0.0' },
        paths: {}
      };

      const hash1 = parser.generateSpecHash(spec1);
      const hash2 = parser.generateSpecHash(spec2);

      expect(hash1).not.toBe(hash2);
    });

    test('should generate same hash regardless of key order', () => {
      const spec1 = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      const spec2 = {
        paths: {},
        info: { version: '1.0.0', title: 'Test' },
        openapi: '3.0.0'
      };

      const hash1 = parser.generateSpecHash(spec1);
      const hash2 = parser.generateSpecHash(spec2);

      expect(hash1).toBe(hash2);
    });
  });

  describe('toProtocolManifest()', () => {
    test('should convert to protocol manifest', async () => {
      const specPath = path.join(fixturesPath, 'simple-api.json');
      await parser.parse(specPath);

      const manifest = parser.toProtocolManifest();

      expect(manifest).toBeDefined();
      expect(manifest.service).toBeDefined();
      expect(manifest.interface).toBeDefined();
      expect(manifest.metadata).toBeDefined();
    });

    test('should include service information', async () => {
      const specPath = path.join(fixturesPath, 'simple-api.json');
      await parser.parse(specPath);

      const manifest = parser.toProtocolManifest();

      expect(manifest.service.name).toBe('Simple Test API');
      expect(manifest.service.version).toBe('1.0.0');
      expect(manifest.service.description).toBeDefined();
      expect(manifest.service.urn).toBeDefined();
    });

    test('should include endpoints', async () => {
      const specPath = path.join(fixturesPath, 'simple-api.json');
      await parser.parse(specPath);

      const manifest = parser.toProtocolManifest();

      expect(manifest.interface.endpoints).toBeDefined();
      expect(Array.isArray(manifest.interface.endpoints)).toBe(true);
      expect(manifest.interface.endpoints.length).toBeGreaterThan(0);
    });

    test('should include authentication', async () => {
      const specPath = path.join(fixturesPath, 'simple-api.json');
      await parser.parse(specPath);

      const manifest = parser.toProtocolManifest();

      expect(manifest.interface.authentication).toBeDefined();
      expect(manifest.interface.authentication.type).toBe('apiKey');
    });

    test('should include schemas', async () => {
      const specPath = path.join(fixturesPath, 'simple-api.json');
      await parser.parse(specPath);

      const manifest = parser.toProtocolManifest();

      expect(manifest.validation).toBeDefined();
      expect(manifest.validation.schemas).toBeDefined();
      expect(Object.keys(manifest.validation.schemas).length).toBeGreaterThan(0);
    });

    test('should include provenance', async () => {
      const specPath = path.join(fixturesPath, 'simple-api.json');
      await parser.parse(specPath);

      const manifest = parser.toProtocolManifest();

      expect(manifest.provenance).toBeDefined();
      expect(manifest.provenance.parser).toBe('OpenAPIParser');
      expect(manifest.provenance.spec_version).toBe('3.0.3');
      expect(manifest.provenance.spec_hash).toBeDefined();
    });

    test('should throw error if no spec is parsed', () => {
      expect(() => parser.toProtocolManifest()).toThrow(/No spec available/);
    });
  });

  describe('clear()', () => {
    test('should clear cached data', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      await parser.parse(spec);
      expect(parser.getParsedSpec()).toBeDefined();
      expect(parser.getSpecHash()).toBeDefined();

      parser.clear();

      expect(parser.getParsedSpec()).toBeNull();
      expect(parser.getSpecHash()).toBeNull();
    });
  });

  describe('error handling', () => {
    test('should return error spec in non-strict mode', async () => {
      parser = new OpenAPIParser({ strictMode: false });

      const invalidSpec = {
        openapi: '1.0.0', // Invalid version
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      const result = await parser.parse(invalidSpec);

      expect(result.error).toBe(true);
      expect(result.message).toBeDefined();
    });

    test('should throw error in strict mode', async () => {
      parser = new OpenAPIParser({ strictMode: true });

      const invalidSpec = {
        openapi: '1.0.0', // Invalid version
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      await expect(parser.parse(invalidSpec)).rejects.toThrow();
    });
  });
});
