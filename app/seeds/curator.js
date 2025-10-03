/**
 * Seed Curator - Manages pre-configured protocol imports
 *
 * Features:
 * - Load seed manifests with bundled overrides
 * - Validate seed completeness and structure
 * - Import seeds with automatic override application
 * - Support multiple seed types (openapi, database)
 */

const fs = require('fs-extra');
const path = require('path');

/**
 * SeedCurator manages loading and importing pre-configured seeds
 */
class SeedCurator {
  constructor(options = {}) {
    this.options = {
      seedsDir: options.seedsDir || path.join(__dirname),
      validateManifests: options.validateManifests !== false,
      ...options
    };

    this._seedCache = new Map();
  }

  /**
   * List all available seeds
   * @param {object} filters - Optional filters { type, tags }
   * @returns {Promise<Array>} Array of seed metadata
   */
  async listSeeds(filters = {}) {
    const seeds = [];

    // Scan openapi seeds
    const openapiDir = path.join(this.options.seedsDir, 'openapi');
    if (await fs.pathExists(openapiDir)) {
      const entries = await fs.readdir(openapiDir);
      for (const entry of entries) {
        const manifestPath = path.join(openapiDir, entry, 'manifest.json');
        if (await fs.pathExists(manifestPath)) {
          const manifest = await fs.readJson(manifestPath);
          if (this._matchesFilters(manifest, filters)) {
            seeds.push({
              ...manifest,
              _path: path.join(openapiDir, entry)
            });
          }
        }
      }
    }

    // Scan database seeds
    const dbDir = path.join(this.options.seedsDir, 'databases');
    if (await fs.pathExists(dbDir)) {
      const entries = await fs.readdir(dbDir);
      for (const entry of entries) {
        const manifestPath = path.join(dbDir, entry, 'manifest.json');
        if (await fs.pathExists(manifestPath)) {
          const manifest = await fs.readJson(manifestPath);
          if (this._matchesFilters(manifest, filters)) {
            seeds.push({
              ...manifest,
              _path: path.join(dbDir, entry)
            });
          }
        }
      }
    }

    return seeds.sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Load a seed by ID
   * @param {string} seedId - Seed identifier
   * @returns {Promise<object>} Seed data { manifest, spec, overrides }
   */
  async loadSeed(seedId) {
    // Check cache
    if (this._seedCache.has(seedId)) {
      return this._seedCache.get(seedId);
    }

    const seeds = await this.listSeeds();
    const seedMeta = seeds.find(s => s.id === seedId);

    if (!seedMeta) {
      throw new Error(`Seed not found: ${seedId}`);
    }

    const seedPath = seedMeta._path;
    const manifest = await fs.readJson(path.join(seedPath, 'manifest.json'));

    // Validate manifest if enabled
    if (this.options.validateManifests) {
      this._validateManifest(manifest);
    }

    const seed = {
      manifest,
      spec: null,
      overrides: [],
      seedPath
    };

    // Load spec for OpenAPI seeds
    if (manifest.type === 'openapi' && manifest.spec_path) {
      const specPath = path.join(seedPath, manifest.spec_path);
      if (await fs.pathExists(specPath)) {
        seed.spec = await fs.readJson(specPath);
      }
    }

    // Load overrides if present
    if (manifest.overrides_path) {
      const overridesPath = path.join(seedPath, manifest.overrides_path);
      if (await fs.pathExists(overridesPath)) {
        seed.overrides = await this._loadOverrides(overridesPath);
      }
    }

    // Cache the seed
    this._seedCache.set(seedId, seed);

    return seed;
  }

  /**
   * Import a seed into a workspace
   * @param {string} seedId - Seed identifier
   * @param {object} options - Import options { workspace, includeOverrides, importer }
   * @returns {Promise<object>} Import result with stats
   */
  async importSeed(seedId, options = {}) {
    const seed = await this.loadSeed(seedId);
    const { manifest, spec, overrides } = seed;

    const workspace = options.workspace || process.cwd();
    const includeOverrides = options.includeOverrides !== false;
    const installArtifacts = options.install !== false;

    const workspacePaths = installArtifacts
      ? await this._prepareWorkspace(workspace)
      : null;

    const result = {
      seedId,
      type: manifest.type,
      stats: {
        protocols: 0,
        pii_fields: 0,
        overrides_applied: 0
      },
      errors: []
    };

    if (manifest.type === 'openapi') {
      if (!options.importer) {
        throw new Error('OpenAPI importer required for openapi seed type');
      }

      // Import via OpenAPI importer
      const imported = await options.importer.import(spec);
      result.stats.protocols = manifest.metadata?.protocol_count || 0;
      result.stats.pii_fields = manifest.metadata?.pii_fields || 0;

      if (installArtifacts && workspacePaths) {
        const files = await this._installOpenAPISeed({
          seed,
          manifest: imported,
          workspacePaths,
          includeOverrides,
          overrides
        });

        result.files = files;
        result.stats.overrides_applied = files.overridesInstalled || 0;
      } else {
        result.stats.overrides_applied = overrides.length;
      }

      result.manifest = imported;
    } else if (manifest.type === 'database') {
      // Database seeds provide connection info but require manual setup
      result.instructions = await this._installDatabaseSeed(seed, workspace, workspacePaths);
    }

    return result;
  }

  /**
   * Get database seed setup instructions
   * @private
   */
  async _installDatabaseSeed(seed, workspace, workspacePaths) {
    const { manifest } = seed;
    const seedPath = seed.seedPath ||
      path.join(this.options.seedsDir, 'databases', manifest.id);

    let targetDir = seedPath;

    if (workspacePaths) {
      targetDir = path.join(workspacePaths.databasesDir, manifest.id);
      await fs.ensureDir(targetDir);

      const filesToCopy = ['docker-compose.yml', 'seed.sql', 'README.md', 'manifest.json'];
      for (const file of filesToCopy) {
        const sourceFile = path.join(seedPath, file);
        if (await fs.pathExists(sourceFile)) {
          await fs.copy(sourceFile, path.join(targetDir, file));
        }
      }
    }

    return {
      type: 'database',
      database: manifest.metadata?.database,
      directory: targetDir,
      setup_command: `docker-compose -f ${path.join(targetDir, 'docker-compose.yml')} up -d`,
      teardown_command: `docker-compose -f ${path.join(targetDir, 'docker-compose.yml')} down`,
      readme: path.join(targetDir, 'README.md')
    };
  }

  /**
   * Load override rules from directory
   * @private
   */
  async _loadOverrides(overridesPath) {
    const overrides = [];
    const entries = await fs.readdir(overridesPath);

    for (const entry of entries) {
      if (entry.endsWith('.json')) {
        const overridePath = path.join(overridesPath, entry);
        const override = await fs.readJson(overridePath);

        // Override files can be arrays of rules or single rules
        if (Array.isArray(override)) {
          overrides.push(...override);
        } else {
          overrides.push(override);
        }
      }
    }

    return overrides;
  }

  /**
   * Validate manifest structure
   * @private
   */
  _validateManifest(manifest) {
    const required = ['id', 'type', 'version', 'name', 'description'];
    for (const field of required) {
      if (!manifest[field]) {
        throw new Error(`Missing required field in manifest: ${field}`);
      }
    }

    const validTypes = ['openapi', 'database'];
    if (!validTypes.includes(manifest.type)) {
      throw new Error(`Invalid seed type: ${manifest.type}`);
    }

    if (manifest.type === 'openapi' && !manifest.spec_path) {
      throw new Error('OpenAPI seeds must specify spec_path');
    }
  }

  /**
   * Check if manifest matches filters
   * @private
   */
  _matchesFilters(manifest, filters) {
    if (filters.type && manifest.type !== filters.type) {
      return false;
    }

    if (filters.tags && filters.tags.length > 0) {
      const manifestTags = manifest.tags || [];
      const hasMatchingTag = filters.tags.some(tag =>
        manifestTags.includes(tag)
      );
      if (!hasMatchingTag) {
        return false;
      }
    }

    return true;
  }

  /**
   * Clear seed cache
   */
  clearCache() {
    this._seedCache.clear();
  }

  /**
   * Ensure workspace structure for seed installation
   * @private
   */
  async _prepareWorkspace(workspace) {
    const protoDir = path.join(workspace, '.proto');
    const manifestsDir = path.join(protoDir, 'manifests');
    const specsDir = path.join(protoDir, 'specs');
    const overridesDir = path.join(protoDir, 'overrides', 'community');
    const databasesDir = path.join(protoDir, 'databases');

    await Promise.all([
      fs.ensureDir(manifestsDir),
      fs.ensureDir(specsDir),
      fs.ensureDir(overridesDir),
      fs.ensureDir(databasesDir)
    ]);

    return {
      protoDir,
      manifestsDir,
      specsDir,
      overridesDir,
      databasesDir
    };
  }

  /**
   * Install OpenAPI seed artifacts into workspace
   * @private
   */
  async _installOpenAPISeed({ seed, manifest, workspacePaths, includeOverrides, overrides }) {
    const seedId = seed.manifest.id;
    const sanitizedId = seedId.replace(/[^a-z0-9_-]/ig, '-');
    const manifestPath = path.join(workspacePaths.manifestsDir, `${sanitizedId}.draft.json`);

    // Write manifest without internal seed metadata
    const manifestToWrite = JSON.parse(JSON.stringify(manifest));
    await fs.writeJson(manifestPath, manifestToWrite, { spaces: 2 });

    // Persist spec for reference
    let specPath = null;
    if (seed.spec) {
      specPath = path.join(workspacePaths.specsDir, `${sanitizedId}-spec.json`);
      await fs.writeJson(specPath, seed.spec, { spaces: 2 });
    }

    let overridesInstalled = 0;
    let overridesPath = null;

    if (includeOverrides && overrides.length > 0 && seed.manifest.overrides_path) {
      const sourceOverridesDir = path.join(seed.seedPath, seed.manifest.overrides_path);
      overridesPath = path.join(workspacePaths.overridesDir, seedId);
      await fs.ensureDir(overridesPath);
      await fs.copy(sourceOverridesDir, overridesPath, { overwrite: true });
      overridesInstalled = overrides.length;
    }

    return {
      manifest: manifestPath,
      spec: specPath,
      overridesDir: overridesPath,
      overridesInstalled
    };
  }
}

module.exports = { SeedCurator };
