/**
 * Seed Registry - Catalog of available demonstration seeds
 *
 * Provides metadata about available seeds without loading full content
 */

/**
 * Static registry of built-in seeds
 * Avoids filesystem scanning for quick lookups
 */
const SEED_REGISTRY = {
  // OpenAPI Seeds
  'stripe-api': {
    id: 'stripe-api',
    type: 'openapi',
    name: 'Stripe API Seed',
    description: 'Stripe payment API with customer and payment endpoints',
    tags: ['payment', 'api', 'stripe', 'saas'],
    metadata: {
      protocol_count: 50,
      pii_fields: 15,
      override_rules: 12,
      api_endpoints: 25
    }
  },
  'github-api': {
    id: 'github-api',
    type: 'openapi',
    name: 'GitHub API Seed',
    description: 'GitHub REST API subset with repos, issues, and users',
    tags: ['api', 'github', 'developer-tools'],
    metadata: {
      protocol_count: 30,
      pii_fields: 8,
      override_rules: 8,
      api_endpoints: 15
    }
  },
  'petstore-api': {
    id: 'petstore-api',
    type: 'openapi',
    name: 'Petstore API Seed',
    description: 'Classic Swagger Petstore example API',
    tags: ['api', 'example', 'pet'],
    metadata: {
      protocol_count: 10,
      pii_fields: 2,
      override_rules: 0,
      api_endpoints: 8
    }
  },

  // Database Seeds
  'northwind-db': {
    id: 'northwind-db',
    type: 'database',
    name: 'Northwind Database',
    description: 'Classic Northwind traders sample database (PostgreSQL)',
    tags: ['database', 'sql', 'sample', 'northwind'],
    metadata: {
      database: 'postgresql',
      tables: 13,
      sample_rows: 1000,
      protocol_count: 13
    }
  },
  'sakila-db': {
    id: 'sakila-db',
    type: 'database',
    name: 'Sakila Database',
    description: 'DVD rental store sample database (PostgreSQL)',
    tags: ['database', 'sql', 'sample', 'sakila'],
    metadata: {
      database: 'postgresql',
      tables: 16,
      sample_rows: 5000,
      protocol_count: 16
    }
  }
};

/**
 * SeedRegistry provides quick access to seed metadata
 */
class SeedRegistry {
  constructor() {
    this._registry = SEED_REGISTRY;
  }

  /**
   * Get all seeds
   * @param {object} filters - Optional filters { type, tags }
   * @returns {Array} Array of seed metadata
   */
  list(filters = {}) {
    let seeds = Object.values(this._registry);

    if (filters.type) {
      seeds = seeds.filter(s => s.type === filters.type);
    }

    if (filters.tags && filters.tags.length > 0) {
      seeds = seeds.filter(s => {
        const seedTags = s.tags || [];
        return filters.tags.some(tag => seedTags.includes(tag));
      });
    }

    return seeds.sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Get seed metadata by ID
   * @param {string} seedId - Seed identifier
   * @returns {object|null} Seed metadata or null if not found
   */
  get(seedId) {
    return this._registry[seedId] || null;
  }

  /**
   * Check if seed exists
   * @param {string} seedId - Seed identifier
   * @returns {boolean}
   */
  has(seedId) {
    return seedId in this._registry;
  }

  /**
   * Get seeds by type
   * @param {string} type - Seed type (openapi, database)
   * @returns {Array} Array of seed metadata
   */
  byType(type) {
    return this.list({ type });
  }

  /**
   * Get seeds by tag
   * @param {string} tag - Tag to filter by
   * @returns {Array} Array of seed metadata
   */
  byTag(tag) {
    return this.list({ tags: [tag] });
  }
}

module.exports = { SeedRegistry, SEED_REGISTRY };
