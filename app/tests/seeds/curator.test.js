/**
 * Tests for SeedCurator
 */

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { SeedCurator } = require('../../seeds/curator');
const { SeedRegistry } = require('../../seeds/registry');

describe('SeedCurator', () => {
  let curator;

  beforeEach(() => {
    curator = new SeedCurator({
      seedsDir: path.join(__dirname, '../../seeds')
    });
  });

  afterEach(() => {
    curator.clearCache();
  });

  describe('listSeeds', () => {
    it('should list all available seeds', async () => {
      const seeds = await curator.listSeeds();

      expect(seeds).toBeInstanceOf(Array);
      expect(seeds.length).toBeGreaterThan(0);

      // Check that we have both OpenAPI and database seeds
      const types = [...new Set(seeds.map(s => s.type))];
      expect(types).toContain('openapi');
      expect(types).toContain('database');
    });

    it('should filter seeds by type', async () => {
      const openapiSeeds = await curator.listSeeds({ type: 'openapi' });

      expect(openapiSeeds.every(s => s.type === 'openapi')).toBe(true);
      expect(openapiSeeds.length).toBeGreaterThan(0);
    });

    it('should filter seeds by tags', async () => {
      const apiSeeds = await curator.listSeeds({ tags: ['api'] });

      expect(apiSeeds.every(s => s.tags.includes('api'))).toBe(true);
      expect(apiSeeds.length).toBeGreaterThan(0);
    });

    it('should return sorted seeds by ID', async () => {
      const seeds = await curator.listSeeds();
      const ids = seeds.map(s => s.id);

      expect(ids).toEqual([...ids].sort());
    });
  });

  describe('loadSeed', () => {
    it('should load Stripe OpenAPI seed', async () => {
      const seed = await curator.loadSeed('stripe-api');

      expect(seed).toHaveProperty('manifest');
      expect(seed).toHaveProperty('spec');
      expect(seed).toHaveProperty('overrides');

      expect(seed.manifest.id).toBe('stripe-api');
      expect(seed.manifest.type).toBe('openapi');
      expect(seed.spec).toBeTruthy();
      expect(seed.overrides).toBeInstanceOf(Array);
      expect(seed.overrides.length).toBe(12); // 6 API patterns + 6 PII patterns
    });

    it('should load GitHub OpenAPI seed', async () => {
      const seed = await curator.loadSeed('github-api');

      expect(seed.manifest.id).toBe('github-api');
      expect(seed.manifest.type).toBe('openapi');
      expect(seed.spec).toBeTruthy();
      expect(seed.overrides.length).toBe(8); // 4 API patterns + 4 PII patterns
    });

    it('should load Petstore OpenAPI seed', async () => {
      const seed = await curator.loadSeed('petstore-api');

      expect(seed.manifest.id).toBe('petstore-api');
      expect(seed.manifest.type).toBe('openapi');
      expect(seed.spec).toBeTruthy();
      expect(seed.overrides.length).toBe(0); // No overrides for baseline
    });

    it('should load Northwind database seed', async () => {
      const seed = await curator.loadSeed('northwind-db');

      expect(seed.manifest.id).toBe('northwind-db');
      expect(seed.manifest.type).toBe('database');
      expect(seed.spec).toBeNull(); // Database seeds don't have specs
      expect(seed.manifest.metadata.tables).toBe(13);
    });

    it('should load Sakila database seed', async () => {
      const seed = await curator.loadSeed('sakila-db');

      expect(seed.manifest.id).toBe('sakila-db');
      expect(seed.manifest.type).toBe('database');
      expect(seed.manifest.metadata.tables).toBe(16);
    });

    it('should cache loaded seeds', async () => {
      const seed1 = await curator.loadSeed('stripe-api');
      const seed2 = await curator.loadSeed('stripe-api');

      expect(seed1).toBe(seed2); // Same object reference
    });

    it('should throw error for non-existent seed', async () => {
      await expect(curator.loadSeed('non-existent'))
        .rejects.toThrow('Seed not found');
    });
  });

  describe('manifest validation', () => {
    it('should validate complete manifests', () => {
      const validManifest = {
        id: 'test-seed',
        type: 'openapi',
        version: '1.0.0',
        name: 'Test Seed',
        description: 'Test description',
        spec_path: './spec.json'
      };

      expect(() => {
        curator._validateManifest(validManifest);
      }).not.toThrow();
    });

    it('should reject manifest without required fields', () => {
      const invalidManifest = {
        id: 'test-seed',
        type: 'openapi'
        // Missing version, name, description
      };

      expect(() => {
        curator._validateManifest(invalidManifest);
      }).toThrow('Missing required field');
    });

    it('should reject manifest with invalid type', () => {
      const invalidManifest = {
        id: 'test-seed',
        type: 'invalid-type',
        version: '1.0.0',
        name: 'Test',
        description: 'Test'
      };

      expect(() => {
        curator._validateManifest(invalidManifest);
      }).toThrow('Invalid seed type');
    });

    it('should require spec_path for OpenAPI seeds', () => {
      const invalidManifest = {
        id: 'test-seed',
        type: 'openapi',
        version: '1.0.0',
        name: 'Test',
        description: 'Test'
        // Missing spec_path
      };

      expect(() => {
        curator._validateManifest(invalidManifest);
      }).toThrow('must specify spec_path');
    });
  });

  describe('importSeed', () => {
    it('should prepare OpenAPI seed for import', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'seed-openapi-'));
      const workspace = path.join(tmpDir, 'workspace');
      await fs.ensureDir(workspace);

      const mockImporter = {
        import: jest.fn().mockResolvedValue({
          version: '1.0',
          type: 'api'
        })
      };

      try {
        const result = await curator.importSeed('stripe-api', {
          workspace,
          importer: mockImporter
        });

        expect(result.seedId).toBe('stripe-api');
        expect(result.type).toBe('openapi');
        expect(result.stats.protocols).toBe(50);
        expect(result.stats.pii_fields).toBe(15);
        expect(result.stats.overrides_applied).toBe(12);

        const manifestPath = path.join(workspace, '.proto', 'manifests', 'stripe-api.draft.json');
        const specPath = path.join(workspace, '.proto', 'specs', 'stripe-api-spec.json');
        const overridesDir = path.join(workspace, '.proto', 'overrides', 'community', 'stripe-api');

        expect(await fs.pathExists(manifestPath)).toBe(true);
        expect(await fs.pathExists(specPath)).toBe(true);
        expect(await fs.pathExists(overridesDir)).toBe(true);

        const savedManifest = await fs.readJson(manifestPath);
        expect(savedManifest.type).toBe('api');
        expect(savedManifest.version).toBe('1.0');
      } finally {
        await fs.remove(tmpDir);
      }
    });

    it('should provide database setup instructions', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'seed-db-'));
      const workspace = path.join(tmpDir, 'workspace');
      await fs.ensureDir(workspace);

      try {
        const result = await curator.importSeed('northwind-db', {
          workspace
        });

        expect(result.type).toBe('database');
        expect(result.instructions).toBeDefined();
        expect(result.instructions.setup_command).toContain('docker-compose');
        expect(result.instructions.database).toBe('postgresql');

        const dbDir = path.join(workspace, '.proto', 'databases', 'northwind-db');
        expect(result.instructions.directory).toBe(dbDir);
        expect(await fs.pathExists(path.join(dbDir, 'docker-compose.yml'))).toBe(true);
        expect(await fs.pathExists(path.join(dbDir, 'README.md'))).toBe(true);
      } finally {
        await fs.remove(tmpDir);
      }
    });

    it('should require importer for OpenAPI seeds', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'seed-require-importer-'));
      const workspace = path.join(tmpDir, 'workspace');
      await fs.ensureDir(workspace);

      try {
        await expect(
          curator.importSeed('stripe-api', { workspace })
        ).rejects.toThrow('OpenAPI importer required');
      } finally {
        await fs.remove(tmpDir);
      }
    });
  });

  describe('clearCache', () => {
    it('should clear seed cache', async () => {
      await curator.loadSeed('stripe-api');
      expect(curator._seedCache.size).toBe(1);

      curator.clearCache();
      expect(curator._seedCache.size).toBe(0);
    });
  });
});

describe('SeedRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new SeedRegistry();
  });

  describe('list', () => {
    it('should list all seeds', () => {
      const seeds = registry.list();

      expect(seeds).toBeInstanceOf(Array);
      expect(seeds.length).toBe(5); // 3 OpenAPI + 2 database
    });

    it('should filter by type', () => {
      const openapiSeeds = registry.list({ type: 'openapi' });

      expect(openapiSeeds).toHaveLength(3);
      expect(openapiSeeds.every(s => s.type === 'openapi')).toBe(true);
    });

    it('should filter by tags', () => {
      const paymentSeeds = registry.list({ tags: ['payment'] });

      expect(paymentSeeds.length).toBeGreaterThan(0);
      expect(paymentSeeds.every(s => s.tags.includes('payment'))).toBe(true);
    });

    it('should return sorted results', () => {
      const seeds = registry.list();
      const ids = seeds.map(s => s.id);

      expect(ids).toEqual([...ids].sort());
    });
  });

  describe('get', () => {
    it('should get seed by ID', () => {
      const seed = registry.get('stripe-api');

      expect(seed).toBeDefined();
      expect(seed.id).toBe('stripe-api');
      expect(seed.type).toBe('openapi');
    });

    it('should return null for non-existent seed', () => {
      const seed = registry.get('non-existent');

      expect(seed).toBeNull();
    });
  });

  describe('has', () => {
    it('should return true for existing seed', () => {
      expect(registry.has('stripe-api')).toBe(true);
    });

    it('should return false for non-existent seed', () => {
      expect(registry.has('non-existent')).toBe(false);
    });
  });

  describe('byType', () => {
    it('should get OpenAPI seeds', () => {
      const seeds = registry.byType('openapi');

      expect(seeds).toHaveLength(3);
      expect(seeds.map(s => s.id)).toEqual(['github-api', 'petstore-api', 'stripe-api']);
    });

    it('should get database seeds', () => {
      const seeds = registry.byType('database');

      expect(seeds).toHaveLength(2);
      expect(seeds.map(s => s.id)).toEqual(['northwind-db', 'sakila-db']);
    });
  });

  describe('byTag', () => {
    it('should get seeds by tag', () => {
      const apiSeeds = registry.byTag('api');

      expect(apiSeeds.length).toBeGreaterThan(0);
      expect(apiSeeds.every(s => s.tags.includes('api'))).toBe(true);
    });

    it('should return empty array for non-existent tag', () => {
      const seeds = registry.byTag('non-existent-tag');

      expect(seeds).toEqual([]);
    });
  });
});
