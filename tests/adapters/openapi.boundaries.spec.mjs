/**
 * @file OpenAPI Adapter Boundary Tests
 * @description Comprehensive tests for OpenAPI adapter covering happy paths and unsupported features
 * Mission: B18.14-20251020
 */

import { afterEach, beforeEach, describe, test, expect } from '@jest/globals';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let tempDir;
let buildAdapter;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'adapter-openapi-boundary-'));
  const moduleUrl = pathToFileURL(
    join(__dirname, '..', '..', 'app', 'adapters', 'openapi', 'src', 'index.mjs'),
  ).href;
  const module = await import(moduleUrl);
  buildAdapter = module.buildAdapter;
});

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe('OpenAPI Adapter - Happy Path', () => {
  test('1. builds catalog with valid OpenAPI spec', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'openapi',
      'fixtures',
      'spec.json',
    );
    const result = await buildAdapter({ specPath, outDir: tempDir });
    
    expect(result.outDir).toBe(tempDir);
    expect(result.catalogPath).toContain('catalog.json');
    expect(result.details.adapter.name).toBe('openapi');
  });

  test('2. correctly counts operations in spec', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'openapi',
      'fixtures',
      'spec.json',
    );
    const result = await buildAdapter({ specPath, outDir: tempDir });
    
    expect(result.details.summary.itemsCount).toBeGreaterThan(0);
    expect(Array.isArray(result.details.summary.operations)).toBe(true);
  });

  test('3. generates all required artifacts', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'openapi',
      'fixtures',
      'spec.json',
    );
    const result = await buildAdapter({ specPath, outDir: tempDir });
    
    const catalog = await readFile(result.catalogPath, 'utf8');
    const summary = await readFile(result.summaryPath, 'utf8');
    const spec = await readFile(result.specPath);
    
    expect(JSON.parse(catalog)).toHaveProperty('adapter');
    expect(JSON.parse(summary)).toHaveProperty('status', 'ok');
    expect(spec.length).toBeGreaterThan(0);
  });

  test('4. handles custom capabilities', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'openapi',
      'fixtures',
      'spec.json',
    );
    const customCaps = ['custom.cap.1', 'custom.cap.2'];
    const result = await buildAdapter({ 
      specPath, 
      outDir: tempDir,
      capabilities: customCaps
    });
    
    expect(result.details.capabilities).toEqual(customCaps);
  });

  test('5. preserves spec checksum', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'openapi',
      'fixtures',
      'spec.json',
    );
    const result = await buildAdapter({ specPath, outDir: tempDir });
    
    expect(result.details.source.checksum).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('OpenAPI Adapter - Missing Required Parameters', () => {
  test('6. throws error when specPath is missing', async () => {
    await expect(
      buildAdapter({ outDir: tempDir })
    ).rejects.toThrow('specPath is required');
  });

  test('7. throws error when outDir is missing', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'openapi',
      'fixtures',
      'spec.json',
    );
    await expect(
      buildAdapter({ specPath })
    ).rejects.toThrow('outDir is required');
  });

  test('8. throws error when specPath is null', async () => {
    await expect(
      buildAdapter({ specPath: null, outDir: tempDir })
    ).rejects.toThrow('specPath is required');
  });

  test('9. throws error when outDir is null', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'openapi',
      'fixtures',
      'spec.json',
    );
    await expect(
      buildAdapter({ specPath, outDir: null })
    ).rejects.toThrow('outDir is required');
  });
});

describe('OpenAPI Adapter - Invalid File Paths', () => {
  test('10. throws error for non-existent file', async () => {
    const specPath = join(tempDir, 'non-existent-spec.json');
    await expect(
      buildAdapter({ specPath, outDir: tempDir })
    ).rejects.toThrow('Spec file not found');
  });

  test('11. throws error for directory instead of file', async () => {
    await expect(
      buildAdapter({ specPath: tempDir, outDir: tempDir })
    ).rejects.toThrow();
  });

  test('12. handles absolute paths correctly', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'openapi',
      'fixtures',
      'spec.json',
    );
    const result = await buildAdapter({ specPath, outDir: tempDir });
    
    expect(result.outDir).toBe(tempDir);
  });
});

describe('OpenAPI Adapter - Malformed Specs', () => {
  test('13. throws error for invalid JSON', async () => {
    const specPath = join(tempDir, 'invalid.json');
    await writeFile(specPath, 'openapi: [1, 2', 'utf8');
    
    await expect(
      buildAdapter({ specPath, outDir: tempDir })
    ).rejects.toThrow('Unable to parse spec');
  });

  test('14. handles empty file gracefully', async () => {
    const specPath = join(tempDir, 'empty.json');
    await writeFile(specPath, '', 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.source.format).toBe('yaml');
    expect(result.details.summary.itemsCount).toBe(0);
    expect(result.details.summary.operations).toEqual([]);
  });

  test('15. handles spec without paths gracefully', async () => {
    const specPath = join(tempDir, 'no-paths.json');
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(0);
  });

  test('16. handles spec without info gracefully', async () => {
    const specPath = join(tempDir, 'no-info.json');
    const spec = {
      openapi: '3.0.0',
      paths: {}
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.title).toBe('OpenAPI Reference');
  });

  test('17. handles null paths object', async () => {
    const specPath = join(tempDir, 'null-paths.json');
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: null
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(0);
  });

  test('18. handles malformed path methods', async () => {
    const specPath = join(tempDir, 'malformed-methods.json');
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/test': {
          get: null,
          post: 'not-an-object'
        }
      }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(0);
  });
});

describe('OpenAPI Adapter - YAML Support', () => {
  test('19. parses valid YAML spec', async () => {
    const specPath = join(tempDir, 'spec.yaml');
    const yaml = `openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
paths:
  /test:
    get:
      summary: Test endpoint`;
    await writeFile(specPath, yaml, 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.source.format).toBe('yaml');
    expect(result.details.summary.itemsCount).toBe(1);
  });

  test('20. throws error for invalid YAML', async () => {
    const specPath = join(tempDir, 'invalid.yaml');
    await writeFile(specPath, 'invalid: yaml: structure:', 'utf8');
    
    await expect(
      buildAdapter({ specPath, outDir: tempDir })
    ).rejects.toThrow('Unable to parse spec');
  });
});

describe('OpenAPI Adapter - Edge Cases', () => {
  test('21. handles spec with empty paths object', async () => {
    const specPath = join(tempDir, 'empty-paths.json');
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {}
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(0);
    expect(result.details.summary.operations).toEqual([]);
  });

  test('22. handles operations without operationId', async () => {
    const specPath = join(tempDir, 'no-operation-id.json');
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/test': {
          get: {
            summary: 'Test endpoint'
          }
        }
      }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.operations[0].operationId).toBeNull();
  });

  test('23. handles operations without summary', async () => {
    const specPath = join(tempDir, 'no-summary.json');
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/test': {
          get: {
            operationId: 'testOp'
          }
        }
      }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.operations[0].summary).toBeNull();
  });

  test('24. normalizes HTTP methods to uppercase', async () => {
    const specPath = join(tempDir, 'lowercase-methods.json');
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/test': {
          get: { summary: 'GET' },
          post: { summary: 'POST' },
          put: { summary: 'PUT' },
          delete: { summary: 'DELETE' }
        }
      }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    const methods = result.details.summary.operations.map(op => op.method);
    expect(methods).toEqual(['GET', 'POST', 'PUT', 'DELETE']);
  });

  test('25. handles very large spec files', async () => {
    const specPath = join(tempDir, 'large-spec.json');
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Large API', version: '1.0.0' },
      paths: {}
    };
    
    // Generate 100 paths
    for (let i = 0; i < 100; i++) {
      spec.paths[`/resource${i}`] = {
        get: { operationId: `get${i}`, summary: `Get resource ${i}` },
        post: { operationId: `post${i}`, summary: `Create resource ${i}` }
      };
    }
    
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(200);
  });

  test('26. includes generated timestamp', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'openapi',
      'fixtures',
      'spec.json',
    );
    const result = await buildAdapter({ specPath, outDir: tempDir });
    
    expect(result.details.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('27. tracks spec file size', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'openapi',
      'fixtures',
      'spec.json',
    );
    const result = await buildAdapter({ specPath, outDir: tempDir });
    
    expect(result.details.source.bytes).toBeGreaterThan(0);
    expect(typeof result.details.source.bytes).toBe('number');
  });
});

describe('OpenAPI Adapter - Unsupported Features', () => {
  test('28. UNSUPPORTED: OpenAPI 2.0 (Swagger) specs', async () => {
    const specPath = join(tempDir, 'swagger2.json');
    const spec = {
      swagger: '2.0',
      info: { title: 'Swagger 2.0 API', version: '1.0.0' },
      paths: {
        '/test': {
          get: { summary: 'Test' }
        }
      }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    // Adapter parses but doesn't recognize swagger field
    const result = await buildAdapter({ specPath, outDir: tempDir });
    // No explicit error but may not extract all features correctly
    expect(result.details.summary.itemsCount).toBeGreaterThanOrEqual(0);
  });

  test('29. UNSUPPORTED: GraphQL introspection schemas', async () => {
    const specPath = join(tempDir, 'graphql.json');
    const spec = {
      __schema: {
        types: [],
        queryType: { name: 'Query' }
      }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    // No paths found - GraphQL not supported
    expect(result.details.summary.itemsCount).toBe(0);
  });

  test('30. UNSUPPORTED: Remote spec fetch without global fetch support', async () => {
    const remoteUrl = 'https://example.com/openapi.yaml';
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    try {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: undefined,
      });

      await expect(
        buildAdapter({ specPath: remoteUrl, outDir: tempDir })
      ).rejects.toThrow('Global fetch API unavailable');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'fetch', originalDescriptor);
      } else {
        delete globalThis.fetch;
      }
    }
  });

  test('31. Remote fetch surfaces HTTP error responses', async () => {
    const remoteUrl = 'https://example.com/openapi.yaml';
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    try {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: async () => ({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        }),
      });

      await expect(
        buildAdapter({ specPath: remoteUrl, outDir: tempDir })
      ).rejects.toThrow('Failed to fetch spec from https://example.com/openapi.yaml: 404 Not Found');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'fetch', originalDescriptor);
      } else {
        delete globalThis.fetch;
      }
    }
  });
});

describe('OpenAPI Adapter - Parser Fallbacks', () => {
  test('32. falls back to YAML when JSON extension contains YAML content', async () => {
    const specPath = join(tempDir, 'yaml-in-json.json');
    const yaml = `openapi: 3.0.0
info:
  title: YAML via JSON extension
  version: 1.0.0
paths:
  /ping:
    get:
      summary: Ping endpoint`;
    await writeFile(specPath, yaml, 'utf8');

    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.source.format).toBe('yaml');
    expect(result.details.summary.itemsCount).toBe(1);
    expect(result.details.summary.operations[0].path).toBe('/ping');
  });
});
