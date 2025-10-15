/**
 * Tests for ParserExtensions facade (B7.1.1)
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ParserExtensions } from '../../packages/protocols/parsers/parser-extensions.js';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../../fixtures/openapi');

describe('ParserExtensions', () => {
  let ext;

  beforeEach(() => {
    ext = new ParserExtensions({ basePath: fixturesDir, refTimeout: 5000 });
  });

  describe('formatError (RFC 7807)', () => {
    it('should format a problem details object', () => {
      const problem = ext.formatError('REF_004', 'Reference target not found', {
        instance: '#/components/schemas/User',
        metadata: { ref: '#/components/schemas/User' }
      });

      expect(problem.type).toMatch(/https:\/\/docs\/errors\/REF_004/);
      expect(problem.title).toBe('Reference target not found');
      expect(problem.status).toBe(404);
      expect(problem.detail).toBe('Reference target not found');
      expect(problem.instance).toBe('#/components/schemas/User');
      expect(problem.code).toBe('REF_004');
      expect(problem.severity).toBeTruthy();
      expect(problem.recoverable).toBeDefined();
    });
  });

  describe('emitProgress', () => {
    it('should emit progress events at 10% intervals', () => {
      const events = [];
      ext.progress.on('progress', (e) => events.push(e.percent));

      // Emit a series of progress updates
      [0, 3, 9, 10, 19, 21, 33, 47, 50, 85, 100].forEach((p) => {
        ext.emitProgress('test-stage', p, {});
      });

      // Expect unique buckets only
      expect(events).toEqual([0, 10, 20, 30, 40, 50, 80, 100]);
    });
  });

  describe('detectCircularRefs', () => {
    it('should detect circular references in fixture', async () => {
      const specPath = path.join(fixturesDir, 'with-circular-refs.json');
      const json = JSON.parse(await fs.readFile(specPath, 'utf-8'));

      const result = ext.detectCircularRefs(json);
      expect(result).toBeDefined();
      expect(result.hasCircular).toBe(true);
      expect(result.cycles.length).toBeGreaterThan(0);
    });
  });

  describe('resolveExternalRefs', () => {
    it('should resolve file-based external refs with timeout', async () => {
      // Build a spec object that references absolute file URLs for fixtures
      const userSchemaUrl = pathToFileURL(path.join(fixturesDir, 'external-schemas', 'user-schema.json')).href;
      const productSchemaUrl = pathToFileURL(path.join(fixturesDir, 'external-schemas', 'product-schema.json')).href;

      const spec = {
        openapi: '3.0.3',
        info: { title: 'Ext Refs', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': {
                  description: 'ok',
                  content: {
                    'application/json': {
                      schema: { type: 'array', items: { $ref: userSchemaUrl } }
                    }
                  }
                }
              }
            }
          },
          '/products': {
            get: {
              responses: {
                '200': {
                  description: 'ok',
                  content: {
                    'application/json': {
                      schema: { type: 'array', items: { $ref: productSchemaUrl } }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const results = await ext.resolveExternalRefs(spec, { timeout: 5000 });
      expect(results.size).toBe(2);
      expect(results.get(userSchemaUrl)).toBeDefined();
      expect(results.get(productSchemaUrl)).toBeDefined();
    });
  });

  describe('error code coverage (formatting)', () => {
    it('should format a problem for every registered error code', async () => {
      const { ERROR_CODES } = await import('../../packages/protocols/parsers/utils/error-codes.js');
      const keys = Object.keys(ERROR_CODES);
      expect(keys.length).toBeGreaterThan(0);

      for (const k of keys) {
        const p = ext.formatError(k, ERROR_CODES[k].message);
        expect(p).toBeDefined();
        expect(p.code).toBe(k);
        expect(typeof p.status).toBe('number');
        expect(p.title).toBeTruthy();
      }
    });
  });
});
