/**
 * Seeds Module - Pre-configured protocol imports for demos
 *
 * Exports:
 * - SeedCurator: Load and import seed manifests
 * - SeedRegistry: Quick seed metadata access
 */

const { SeedCurator } = require('./curator');
const { SeedRegistry } = require('./registry');

module.exports = {
  SeedCurator,
  SeedRegistry
};
