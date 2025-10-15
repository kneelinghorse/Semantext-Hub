/**
 * CJS Test Shim for approve command
 */
const fs = require('fs-extra');

async function approveCommand(manifestPath, options = {}) {
  try {
    if (!await fs.pathExists(manifestPath)) {
      console.error(`Manifest not found: ${manifestPath}`);
      process.exit(1);
      return null;
    }

    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const status = manifest.metadata?.status || 'draft';

    if (status === 'approved') {
      console.warn('Manifest is already approved');
      return { ok: true };
    }

    if (status === 'error' && !options.force) {
      console.error('Cannot approve manifest in error status. Use --force to override.');
      process.exit(1);
      return null;
    }

    const approvedBy = process.env.USER || process.env.USERNAME || 'unknown';
    const approvedAt = new Date().toISOString();

    const updated = {
      ...manifest,
      metadata: {
        ...(manifest.metadata || {}),
        status: 'approved',
        approved_at: approvedAt,
        approved_by: approvedBy,
        state_history: [
          ...(manifest.metadata?.state_history || []),
          { from: status, to: 'approved', at: approvedAt, by: approvedBy }
        ]
      }
    };

    // Write to approved file next to draft
    const approvedPath = manifestPath.replace('.draft.', '.approved.');
    await fs.writeFile(approvedPath, JSON.stringify(updated, null, 2));
    console.log('Manifest approved');
    return { ok: true, approvedPath };
  } catch (error) {
    console.error(`Approve failed: ${error.message}`);
    process.exit(1);
    return null;
  }
}

module.exports = { approveCommand };
