/**
 * Contract Tester Tests
 * Mission B7.6.0 - Test Infrastructure & CI
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ContractTester, runContractTests } from '../../packages/runtime/test-infrastructure/contract-tester.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ContractTester', () => {
  const testFixturesDir = path.join(__dirname, '../fixtures/test-fixtures-output');
  let tester;

  beforeEach(async () => {
    // Create test fixtures
    await fs.mkdir(testFixturesDir, { recursive: true });
    
    // Create sample fixtures
    const openapiDir = path.join(testFixturesDir, 'openapi');
    await fs.mkdir(openapiDir, { recursive: true });
    
    await fs.writeFile(
      path.join(openapiDir, 'minimal.json'),
      JSON.stringify({
        openapi: '3.0.0',
        info: {
          title: 'Test API',
          version: '1.0.0'
        },
        paths: {
          '/test': {
            get: {
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      }, null, 2)
    );

    await fs.writeFile(
      path.join(openapiDir, 'invalid.json'),
      JSON.stringify({
        openapi: '3.0.0',
        info: {
          title: 'Invalid API',
          version: 'invalid-version'
        }
      }, null, 2)
    );

    tester = new ContractTester({
      fixturesDir: testFixturesDir,
      verbose: false
    });
  });

  afterEach(async () => {
    // Clean up
    try {
      await fs.rm(testFixturesDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    it('should create instance with schemas loaded', () => {
      expect(tester.schemas).toBeDefined();
      expect(tester.schemas.has('openapi')).toBe(true);
      expect(tester.schemas.has('asyncapi')).toBe(true);
      expect(tester.schemas.has('manifest')).toBe(true);
      expect(tester.schemas.has('workflow')).toBe(true);
    });
  });

  describe('runContractTests', () => {
    it('should run contract tests and return results', async () => {
      const results = await tester.runContractTests();

      expect(results).toBeDefined();
      expect(results.total).toBeGreaterThan(0);
      expect(results.passed).toBeGreaterThanOrEqual(0);
      expect(results.failed).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(results.errors)).toBe(true);
    });

    it('should validate valid fixtures as passed', async () => {
      const results = await tester.runContractTests();

      // Should have at least one passed test (minimal.json)
      expect(results.passed).toBeGreaterThan(0);
    });

    it('should validate invalid fixtures as failed', async () => {
      const results = await tester.runContractTests();

      // Should have at least one failed test (invalid.json)
      expect(results.failed).toBeGreaterThan(0);
    });
  });

  describe('testCategory', () => {
    it('should test a specific category', async () => {
      const fixtures = {
        minimal: {
          openapi: '3.0.0',
          info: { title: 'Test', version: '1.0.0' },
          paths: { '/test': { get: { responses: { '200': { description: 'OK' } } } } }
        }
      };

      const results = await tester.testCategory('openapi', fixtures);

      expect(results.total).toBe(1);
      expect(results.passed).toBe(1);
      expect(results.failed).toBe(0);
      expect(results.errors).toHaveLength(0);
    });
  });

  describe('validateFixture', () => {
    it('should validate a valid fixture', async () => {
      const fixture = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      const isValid = await tester.validateFixture('openapi', 'test', fixture);
      expect(isValid).toBe(true);
    });

    it('should reject an invalid fixture', async () => {
      const fixture = {
        openapi: '2.0.0', // Invalid version
        info: { title: 'Test API' } // Missing version
      };

      const isValid = await tester.validateFixture('openapi', 'test', fixture);
      expect(isValid).toBe(false);
    });

    it('should reject invalid fixtures by name', async () => {
      const fixture = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      const isValid = await tester.validateFixture('openapi', 'invalid', fixture);
      expect(isValid).toBe(false);
    });
  });

  describe('testProtocolManifest', () => {
    it('should test a valid protocol manifest', async () => {
      const manifestPath = path.join(testFixturesDir, 'test-manifest.json');
      const manifest = {
        apiVersion: 'protocol.ossp-agi.dev/v1',
        kind: 'APIProtocol',
        metadata: {
          name: 'test-api',
          version: '1.0.0'
        },
        spec: {
          openapi: '3.0.0',
          info: { title: 'Test API', version: '1.0.0' }
        }
      };

      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      const result = await tester.testProtocolManifest(manifestPath);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.manifest).toBeDefined();
    });

    it('should reject an invalid protocol manifest', async () => {
      const manifestPath = path.join(testFixturesDir, 'invalid-manifest.json');
      const manifest = {
        // Missing required fields
        kind: 'APIProtocol'
      };

      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      const result = await tester.testProtocolManifest(manifestPath);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('testOpenAPISpec', () => {
    it('should test a valid OpenAPI spec', async () => {
      const specPath = path.join(testFixturesDir, 'test-openapi.json');
      const spec = {
        openapi: '3.0.0',
        info: {
          title: 'Test API',
          version: '1.0.0'
        },
        paths: {
          '/test': {
            get: {
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      await fs.writeFile(specPath, JSON.stringify(spec, null, 2));

      const result = await tester.testOpenAPISpec(specPath);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.spec).toBeDefined();
    });

    it('should reject an invalid OpenAPI spec', async () => {
      const specPath = path.join(testFixturesDir, 'invalid-openapi.json');
      const spec = {
        openapi: '2.0.0', // Invalid version
        info: {
          title: 'Test API'
          // Missing version
        }
      };

      await fs.writeFile(specPath, JSON.stringify(spec, null, 2));

      const result = await tester.testOpenAPISpec(specPath);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('testAsyncAPISpec', () => {
    it('should test a valid AsyncAPI spec', async () => {
      const specPath = path.join(testFixturesDir, 'test-asyncapi.json');
      const spec = {
        asyncapi: '2.6.0',
        info: {
          title: 'Test Event API',
          version: '1.0.0'
        },
        channels: {
          'test.event': {
            publish: {
              message: {
                payload: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      };

      await fs.writeFile(specPath, JSON.stringify(spec, null, 2));

      const result = await tester.testAsyncAPISpec(specPath);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.spec).toBeDefined();
    });
  });
});

describe('runContractTests function', () => {
  it('should run contract tests using standalone function', async () => {
    const results = await runContractTests({
      fixturesDir: path.join(__dirname, '../fixtures/test-fixtures-output'),
      verbose: false
    });

    expect(results).toBeDefined();
    expect(typeof results.total).toBe('number');
    expect(typeof results.passed).toBe('number');
    expect(typeof results.failed).toBe('number');
  });
});
