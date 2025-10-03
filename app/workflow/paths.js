/**
 * Workflow Path Helpers
 *
 * Utilities for deriving manifest workflow file paths.
 */

const path = require('path');

/**
 * Get approved manifest path from draft path.
 * Converts: manifest.draft.json → manifest.approved.json
 * Or inserts `.approved` before extension if no `.draft` suffix.
 *
 * @param {string} draftPath - Path to the draft manifest file
 * @returns {string} Path to the approved manifest file
 */
function getApprovedPath(draftPath) {
  const parsed = path.parse(draftPath);

  if (parsed.name.endsWith('.draft')) {
    const baseName = parsed.name.slice(0, -6); // remove '.draft'
    return path.join(parsed.dir, `${baseName}.approved${parsed.ext}`);
  }

  return path.join(parsed.dir, `${parsed.name}.approved${parsed.ext}`);
}

module.exports = {
  getApprovedPath
};
