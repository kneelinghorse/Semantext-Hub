/**
 * CJS Test Shim for review command
 * Minimal behavior to satisfy tests.
 */
const fs = require('fs-extra');

async function reviewCommand(manifestPath, _options = {}) {
  try {
    if (!await fs.pathExists(manifestPath)) {
      console.error(`Manifest not found: ${manifestPath}`);
      process.exit(1);
      return null;
    }

    const content = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(content);
    const status = manifest.metadata?.status || 'unknown';
    console.log(`Status: ${status}`);
    process.exit(0);
    return { ok: true };
  } catch (error) {
    console.error(`Review failed: ${error.message}`);
    process.exit(1);
    return null;
  }
}

module.exports = { reviewCommand };

