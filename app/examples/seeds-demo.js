/**
 * Seed System Demonstration
 *
 * Shows how to use SeedCurator and SeedRegistry to:
 * - List available demonstration seeds
 * - Load and inspect seed manifests
 * - Import OpenAPI seeds with bundled overrides
 * - Set up database seeds
 */

const path = require('path');
const { SeedCurator, SeedRegistry } = require('../seeds');

async function demonstrateSeedRegistry() {
  console.log('\n=== Seed Registry Demo ===\n');

  const registry = new SeedRegistry();

  // List all seeds
  console.log('All available seeds:');
  const allSeeds = registry.list();
  allSeeds.forEach(seed => {
    console.log(`  - ${seed.id}: ${seed.description}`);
  });

  // Filter by type
  console.log('\nOpenAPI seeds only:');
  const openapiSeeds = registry.byType('openapi');
  openapiSeeds.forEach(seed => {
    console.log(`  - ${seed.id} (${seed.metadata.api_endpoints} endpoints, ${seed.metadata.override_rules} overrides)`);
  });

  // Filter by tag
  console.log('\nPayment-related seeds:');
  const paymentSeeds = registry.byTag('payment');
  paymentSeeds.forEach(seed => {
    console.log(`  - ${seed.id}: ${seed.name}`);
  });

  // Get specific seed
  console.log('\nStripe seed details:');
  const stripeSeed = registry.get('stripe-api');
  console.log(`  ID: ${stripeSeed.id}`);
  console.log(`  Type: ${stripeSeed.type}`);
  console.log(`  Tags: ${stripeSeed.tags.join(', ')}`);
  console.log(`  Endpoints: ${stripeSeed.metadata.api_endpoints}`);
  console.log(`  PII Fields: ${stripeSeed.metadata.pii_fields}`);
  console.log(`  Override Rules: ${stripeSeed.metadata.override_rules}`);
}

async function demonstrateSeedLoading() {
  console.log('\n=== Seed Loading Demo ===\n');

  const curator = new SeedCurator({
    seedsDir: path.join(__dirname, '../seeds')
  });

  // Load OpenAPI seed
  console.log('Loading Stripe API seed...');
  const stripeSeed = await curator.loadSeed('stripe-api');
  console.log(`  Manifest loaded: ${stripeSeed.manifest.name}`);
  console.log(`  Spec loaded: ${stripeSeed.spec.info.title} v${stripeSeed.spec.info.version}`);
  console.log(`  Paths: ${Object.keys(stripeSeed.spec.paths).length}`);
  console.log(`  Overrides loaded: ${stripeSeed.overrides.length} rules`);

  // Show override breakdown
  const overrideTypes = stripeSeed.overrides.reduce((acc, rule) => {
    acc[rule.type] = (acc[rule.type] || 0) + 1;
    return acc;
  }, {});
  console.log('  Override types:');
  Object.entries(overrideTypes).forEach(([type, count]) => {
    console.log(`    - ${type}: ${count}`);
  });

  // Load database seed
  console.log('\nLoading Northwind database seed...');
  const northwindSeed = await curator.loadSeed('northwind-db');
  console.log(`  Manifest loaded: ${northwindSeed.manifest.name}`);
  console.log(`  Database: ${northwindSeed.manifest.metadata.database}`);
  console.log(`  Tables: ${northwindSeed.manifest.metadata.tables}`);
  console.log(`  Sample rows: ${northwindSeed.manifest.metadata.sample_rows}`);
  console.log(`  Port: ${northwindSeed.manifest.metadata.port}`);

  // Load Petstore (no overrides)
  console.log('\nLoading Petstore API seed...');
  const petstoreSeed = await curator.loadSeed('petstore-api');
  console.log(`  Manifest loaded: ${petstoreSeed.manifest.name}`);
  console.log(`  Spec loaded: ${petstoreSeed.spec.info.title}`);
  console.log(`  Overrides: ${petstoreSeed.overrides.length} (baseline example)`);
}

async function demonstrateSeedImport() {
  console.log('\n=== Seed Import Demo ===\n');

  const curator = new SeedCurator({
    seedsDir: path.join(__dirname, '../seeds')
  });

  // Simulate OpenAPI import
  console.log('Simulating Stripe API import...');

  const mockImporter = {
    import: async (spec) => {
      return {
        version: '1.0',
        type: 'api',
        info: {
          title: spec.info.title
        }
      };
    }
  };

  const result = await curator.importSeed('stripe-api', {
    workspace: '/tmp/demo-workspace',
    importer: mockImporter,
    includeOverrides: true
  });

  console.log(`  Seed ID: ${result.seedId}`);
  console.log(`  Type: ${result.type}`);
  console.log(`  Stats:`);
  console.log(`    - Protocols: ${result.stats.protocols}`);
  console.log(`    - PII fields: ${result.stats.pii_fields}`);
  console.log(`    - Overrides applied: ${result.stats.overrides_applied}`);

  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.length}`);
  }

  // Database seed instructions
  console.log('\nGetting Northwind database setup instructions...');
  const dbResult = await curator.importSeed('northwind-db', {
    workspace: '/tmp/demo-workspace'
  });

  console.log(`  Database: ${dbResult.instructions.database}`);
  console.log(`  Setup: ${dbResult.instructions.setup_command}`);
  console.log(`  Teardown: ${dbResult.instructions.teardown_command}`);
  console.log(`  README: ${dbResult.instructions.readme}`);
}

async function demonstrateSeedComparison() {
  console.log('\n=== Seed Comparison Demo ===\n');

  const curator = new SeedCurator({
    seedsDir: path.join(__dirname, '../seeds')
  });

  const seeds = ['stripe-api', 'github-api', 'petstore-api'];

  console.log('Comparing OpenAPI seeds:\n');
  console.log('Seed ID          | Endpoints | PII Fields | Overrides | Tags');
  console.log('-----------------|-----------|------------|-----------|------------------');

  for (const seedId of seeds) {
    const seed = await curator.loadSeed(seedId);
    const meta = seed.manifest.metadata;

    console.log(
      `${seedId.padEnd(16)} | ${String(meta.api_endpoints).padStart(9)} | ` +
      `${String(meta.pii_fields).padStart(10)} | ${String(meta.override_rules).padStart(9)} | ` +
      `${seed.manifest.tags.slice(0, 2).join(', ')}`
    );
  }
}

async function main() {
  try {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   Seed System Demonstration           ║');
    console.log('╚════════════════════════════════════════╝');

    await demonstrateSeedRegistry();
    await demonstrateSeedLoading();
    await demonstrateSeedImport();
    await demonstrateSeedComparison();

    console.log('\n✅ Demo complete!\n');
    console.log('Try running:');
    console.log('  node app/cli/index.js demo list');
    console.log('  node app/cli/index.js demo run stripe-api\n');
  } catch (err) {
    console.error('\n❌ Demo failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
