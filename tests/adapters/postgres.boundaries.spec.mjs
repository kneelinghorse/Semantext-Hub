/**
 * @file Postgres Adapter Boundary Tests
 * @description Comprehensive tests for Postgres adapter covering happy paths and unsupported features
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
  tempDir = await mkdtemp(join(tmpdir(), 'adapter-postgres-boundary-'));
  const moduleUrl = pathToFileURL(
    join(__dirname, '..', '..', 'app', 'adapters', 'postgres', 'src', 'index.mjs'),
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

describe('Postgres Adapter - Happy Path', () => {
  test('1. builds catalog with valid Postgres schema', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'postgres',
      'fixtures',
      'minimal.json',
    );
    const result = await buildAdapter({ specPath, outDir: tempDir });
    
    expect(result.outDir).toBe(tempDir);
    expect(result.catalogPath).toContain('catalog.json');
    expect(result.details.adapter.name).toBe('postgres');
  });

  test('2. correctly identifies adapter type as data', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'postgres',
      'fixtures',
      'minimal.json',
    );
    const result = await buildAdapter({ specPath, outDir: tempDir });
    
    expect(result.details.adapter.type).toBe('data');
  });

  test('3. counts tables/entities correctly', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'postgres',
      'fixtures',
      'minimal.json',
    );
    const result = await buildAdapter({ specPath, outDir: tempDir });
    
    expect(result.details.summary.itemsCount).toBeGreaterThan(0);
    expect(Array.isArray(result.details.summary.entities)).toBe(true);
  });

  test('4. extracts table metadata', async () => {
    const specPath = join(tempDir, 'with-metadata.json');
    const spec = {
      name: 'Test Schema',
      version: '1.0.0',
      tables: [
        {
          name: 'users',
          description: 'User accounts',
          columns: [
            { name: 'id', type: 'uuid' },
            { name: 'email', type: 'text' }
          ]
        }
      ]
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.entities[0].name).toBe('users');
    expect(result.details.summary.entities[0].description).toBe('User accounts');
    expect(result.details.summary.entities[0].columns).toBe(2);
  });

  test('5. handles custom capabilities', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'postgres',
      'fixtures',
      'minimal.json',
    );
    const customCaps = ['adapter.data.query', 'adapter.data.mutate'];
    const result = await buildAdapter({ 
      specPath, 
      outDir: tempDir,
      capabilities: customCaps
    });
    
    expect(result.details.capabilities).toEqual(customCaps);
  });
});

describe('Postgres Adapter - Missing Required Parameters', () => {
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
      'postgres',
      'fixtures',
      'minimal.json',
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

  test('9. throws error when outDir is undefined', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'postgres',
      'fixtures',
      'minimal.json',
    );
    await expect(
      buildAdapter({ specPath, outDir: undefined })
    ).rejects.toThrow('outDir is required');
  });
});

describe('Postgres Adapter - Invalid File Paths', () => {
  test('10. throws error for non-existent file', async () => {
    const specPath = join(tempDir, 'missing-schema.json');
    await expect(
      buildAdapter({ specPath, outDir: tempDir })
    ).rejects.toThrow('Spec file not found');
  });

  test('11. throws error for directory path', async () => {
    await expect(
      buildAdapter({ specPath: __dirname, outDir: tempDir })
    ).rejects.toThrow();
  });

  test('12. resolves relative paths', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'postgres',
      'fixtures',
      'minimal.json',
    );
    const result = await buildAdapter({ specPath, outDir: tempDir });
    
    expect(result.details.source.stored).toBe('minimal.json');
  });
});

describe('Postgres Adapter - Malformed Specs', () => {
  test('13. throws error for invalid JSON', async () => {
    const specPath = join(tempDir, 'invalid.json');
    await writeFile(specPath, 'tables: [1, 2', 'utf8');
    
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
    expect(result.details.summary.entities).toEqual([]);
  });

  test('15. handles spec without tables gracefully', async () => {
    const specPath = join(tempDir, 'no-tables.json');
    const spec = {
      name: 'Empty Schema',
      version: '1.0.0'
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(0);
  });

  test('16. handles spec without name gracefully', async () => {
    const specPath = join(tempDir, 'no-name.json');
    const spec = {
      tables: []
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.title).toBe('Postgres DDL Reference');
  });

  test('17. handles null tables array', async () => {
    const specPath = join(tempDir, 'null-tables.json');
    const spec = {
      name: 'Test',
      version: '1.0.0',
      tables: null
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(0);
  });

  test('18. handles malformed table definitions', async () => {
    const specPath = join(tempDir, 'malformed-tables.json');
    const spec = {
      name: 'Test',
      version: '1.0.0',
      tables: [
        { name: 'valid', columns: [] },
        null,
        'invalid-string',
        { columns: [] } // missing name
      ]
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBeGreaterThanOrEqual(1);
  });
});

describe('Postgres Adapter - Schema Object Format', () => {
  test('19. handles schema object format (alternative to tables array)', async () => {
    const specPath = join(tempDir, 'schema-object.json');
    const spec = {
      name: 'Test Schema',
      version: '1.0.0',
      schema: {
        users: {
          description: 'Users table',
          columns: [
            { name: 'id', type: 'uuid' },
            { name: 'name', type: 'text' }
          ]
        },
        posts: {
          description: 'Posts table',
          columns: [
            { name: 'id', type: 'uuid' },
            { name: 'title', type: 'text' }
          ]
        }
      }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(2);
    expect(result.details.summary.entities[0].name).toBe('users');
  });

  test('20. handles schema object without column counts', async () => {
    const specPath = join(tempDir, 'schema-no-columns.json');
    const spec = {
      name: 'Test Schema',
      schema: {
        users: {
          description: 'Users table'
        }
      }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.entities[0].columns).toBeNull();
  });
});

describe('Postgres Adapter - YAML Support', () => {
  test('21. parses valid YAML schema', async () => {
    const specPath = join(tempDir, 'schema.yaml');
    const yaml = `name: Database Schema
version: 1.0.0
tables:
  - name: users
    description: User accounts
    columns:
      - name: id
        type: uuid
      - name: email
        type: text`;
    await writeFile(specPath, yaml, 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.source.format).toBe('yaml');
    expect(result.details.summary.itemsCount).toBe(1);
  });

  test('22. throws error for invalid YAML', async () => {
    const specPath = join(tempDir, 'invalid.yml');
    await writeFile(specPath, 'tables:\n  - [invalid\n    yaml', 'utf8');
    
    await expect(
      buildAdapter({ specPath, outDir: tempDir })
    ).rejects.toThrow('Unable to parse spec');
  });
});

describe('Postgres Adapter - Edge Cases', () => {
  test('23. handles empty tables array', async () => {
    const specPath = join(tempDir, 'empty-tables.json');
    const spec = {
      name: 'Empty Schema',
      version: '1.0.0',
      tables: []
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(0);
    expect(result.details.summary.entities).toEqual([]);
  });

  test('24. handles tables without descriptions', async () => {
    const specPath = join(tempDir, 'no-descriptions.json');
    const spec = {
      name: 'Test',
      tables: [
        { name: 'users', columns: [] }
      ]
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.entities[0].description).toBeNull();
  });

  test('25. handles tables without column definitions', async () => {
    const specPath = join(tempDir, 'no-columns.json');
    const spec = {
      name: 'Test',
      tables: [
        { name: 'users', description: 'Users' }
      ]
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.entities[0].columns).toBeNull();
  });

  test('26. handles very large schema with many tables', async () => {
    const specPath = join(tempDir, 'large-schema.json');
    const spec = {
      name: 'Large Database',
      version: '1.0.0',
      tables: []
    };
    
    // Generate 100 tables
    for (let i = 0; i < 100; i++) {
      spec.tables.push({
        name: `table_${i}`,
        description: `Table number ${i}`,
        columns: [
          { name: 'id', type: 'uuid' },
          { name: 'created_at', type: 'timestamp' }
        ]
      });
    }
    
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(100);
  });

  test('27. preserves table names with special characters', async () => {
    const specPath = join(tempDir, 'special-names.json');
    const spec = {
      name: 'Test',
      tables: [
        { name: 'user_accounts', columns: [] },
        { name: 'order-items', columns: [] },
        { name: 'product.variants', columns: [] }
      ]
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    const tableNames = result.details.summary.entities.map(e => e.name);
    expect(tableNames).toContain('user_accounts');
    expect(tableNames).toContain('order-items');
    expect(tableNames).toContain('product.variants');
  });
});

describe('Postgres Adapter - Unsupported Features', () => {
  test('28. UNSUPPORTED: DDL constraints (foreign keys, unique, etc)', async () => {
    const specPath = join(tempDir, 'with-constraints.json');
    const spec = {
      name: 'Schema with Constraints',
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'uuid', primary: true },
            { name: 'email', type: 'text', unique: true }
          ],
          constraints: {
            primaryKey: ['id'],
            unique: ['email']
          }
        },
        {
          name: 'posts',
          columns: [
            { name: 'id', type: 'uuid' },
            { name: 'user_id', type: 'uuid' }
          ],
          foreignKeys: [
            { column: 'user_id', references: 'users.id' }
          ]
        }
      ]
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    // Adapter counts tables but doesn't process constraints
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(2);
    expect(result.details.summary.entities[0]).not.toHaveProperty('constraints');
  });

  test('29. UNSUPPORTED: Indexes and performance tuning', async () => {
    const specPath = join(tempDir, 'with-indexes.json');
    const spec = {
      name: 'Schema with Indexes',
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'uuid' },
            { name: 'email', type: 'text' },
            { name: 'created_at', type: 'timestamp' }
          ],
          indexes: [
            { name: 'idx_email', columns: ['email'], unique: true },
            { name: 'idx_created', columns: ['created_at'] }
          ]
        }
      ]
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    // Adapter counts table but doesn't process indexes
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(1);
    expect(result.details.summary.entities[0]).not.toHaveProperty('indexes');
  });

  test('30. UNSUPPORTED: Triggers and stored procedures', async () => {
    const specPath = join(tempDir, 'with-procedures.json');
    const spec = {
      name: 'Schema with Procedures',
      tables: [
        {
          name: 'users',
          columns: [{ name: 'id', type: 'uuid' }]
        }
      ],
      procedures: {
        'create_user': {
          parameters: ['email text', 'name text'],
          returns: 'uuid',
          language: 'plpgsql',
          body: 'INSERT INTO users...'
        }
      },
      triggers: [
        {
          name: 'update_timestamp',
          table: 'users',
          event: 'BEFORE UPDATE',
          function: 'update_modified_column()'
        }
      ]
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    // Adapter only processes tables
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(1);
    expect(result.details.summary).not.toHaveProperty('procedures');
    expect(result.details.summary).not.toHaveProperty('triggers');
  });

  test('31. Remote schema fetch without global fetch support fails fast', async () => {
    const remoteUrl = 'https://example.com/postgres-schema.yaml';
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
});

describe('Postgres Adapter - Parser Fallbacks', () => {
  test('32. falls back to YAML when JSON extension contains YAML content', async () => {
    const specPath = join(tempDir, 'yaml-in-json.json');
    const yaml = `name: YAML-backed Schema
version: 1.0.0
tables:
  - name: yaml_users
    columns:
      - name: id
        type: uuid`;
    await writeFile(specPath, yaml, 'utf8');

    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.source.format).toBe('yaml');
    expect(result.details.summary.itemsCount).toBe(1);
    expect(result.details.summary.entities[0].name).toBe('yaml_users');
  });
});
