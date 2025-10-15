/**
 * URN Utilities for Protocol Graph
 *
 * Handles parsing, validation, and normalization of URNs.
 * Format: urn:proto:<kind>:<authority>/<id>[@<version>]
 *
 * Examples:
 *   urn:proto:api:github.com/repos
 *   urn:proto:api.endpoint:github.com/repos/list@1.0.0
 *   urn:proto:data:myapp/users
 *   urn:proto:event:stripe.com/payment.succeeded@^2.0.0
 */

const VALID_KINDS = new Set([
  'api',
  'api.endpoint',
  'data',
  'event',
  'workflow',
  'agent',
  'integration',
  'iam',
  'semantic'
]);

/**
 * Parse a URN string into its components
 * @param {string} urn - URN string to parse
 * @returns {Object|null} Parsed components or null if invalid
 */
function parseURN(urn) {
  if (typeof urn !== 'string') {
    return null;
  }

  // Match URN pattern: urn:proto:<kind>:<authority>/<id>[@<version>] or urn:proto:<kind>:<id>[@<version>]
  const pattern = /^urn:proto:([^:]+):(?:([a-zA-Z0-9._-]+)\/)?([a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*)(?:@(.+))?$/;
  const match = urn.match(pattern);

  if (!match) {
    return null;
  }

  const [, kind, authority, id, version] = match;

  // Validate kind
  if (!VALID_KINDS.has(kind)) {
    return null;
  }

  return {
    kind,
    authority,
    id,
    version: version || null,
    urn // Original URN
  };
}

/**
 * Validate a URN string
 * @param {string} urn - URN to validate
 * @returns {boolean} True if valid
 */
function isValidURN(urn) {
  return parseURN(urn) !== null;
}

/**
 * Normalize a URN (removes version for comparison)
 * @param {string} urn - URN to normalize
 * @returns {string|null} Normalized URN without version
 */
function normalizeURN(urn) {
  const parsed = parseURN(urn);
  if (!parsed) {
    return null;
  }

  return `urn:proto:${parsed.kind}:${parsed.authority}/${parsed.id}`;
}

/**
 * Extract version from URN
 * @param {string} urn - URN with optional version
 * @returns {string|null} Version string or null
 */
function extractVersion(urn) {
  const parsed = parseURN(urn);
  return parsed ? parsed.version : null;
}

/**
 * Check if a version matches a version range
 * Simple implementation supporting:
 *   - Exact: "1.0.0"
 *   - Caret: "^1.0.0" (1.x.x)
 *   - Tilde: "~1.0.0" (1.0.x)
 *   - GTE: ">=1.0.0"
 *   - Range: ">=1.0.0 <2.0.0"
 *
 * @param {string} version - Actual version (e.g., "1.2.3")
 * @param {string} range - Version range (e.g., "^1.0.0")
 * @returns {boolean} True if version matches range
 */
function versionMatchesRange(version, range) {
  if (!version || !range) {
    return false;
  }

  // Normalize versions (remove 'v' prefix if present)
  version = version.replace(/^v/, '');
  range = range.replace(/^v/, '');

  // Exact match
  if (version === range) {
    return true;
  }

  // Parse version into parts
  const versionParts = parseVersionParts(version);
  if (!versionParts) {
    return false;
  }

  // Handle range (e.g., ">=1.0.0 <2.0.0") - must check first before individual operators
  if (range.includes(' ')) {
    const parts = range.split(' ').filter(p => p.trim());
    return parts.every(part => versionMatchesRange(version, part));
  }

  // Handle caret (^)
  if (range.startsWith('^')) {
    const rangeParts = parseVersionParts(range.slice(1));
    if (!rangeParts) return false;
    return versionParts.major === rangeParts.major &&
           versionParts.num >= rangeParts.num;
  }

  // Handle tilde (~)
  if (range.startsWith('~')) {
    const rangeParts = parseVersionParts(range.slice(1));
    if (!rangeParts) return false;
    return versionParts.major === rangeParts.major &&
           versionParts.minor === rangeParts.minor &&
           versionParts.patch >= rangeParts.patch;
  }

  // Handle >= operator (must check before >)
  if (range.startsWith('>=')) {
    const rangeParts = parseVersionParts(range.slice(2).trim());
    if (!rangeParts) return false;
    return versionParts.num >= rangeParts.num;
  }

  // Handle <= operator (must check before <)
  if (range.startsWith('<=')) {
    const rangeParts = parseVersionParts(range.slice(2).trim());
    if (!rangeParts) return false;
    return versionParts.num <= rangeParts.num;
  }

  // Handle > operator
  if (range.startsWith('>')) {
    const rangeParts = parseVersionParts(range.slice(1).trim());
    if (!rangeParts) return false;
    return versionParts.num > rangeParts.num;
  }

  // Handle < operator
  if (range.startsWith('<')) {
    const rangeParts = parseVersionParts(range.slice(1).trim());
    if (!rangeParts) return false;
    return versionParts.num < rangeParts.num;
  }

  return false;
}

/**
 * Parse version string into comparable parts
 * @param {string} version - Version string (e.g., "1.2.3")
 * @returns {Object|null} Parsed version parts
 */
function parseVersionParts(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return null;
  }

  const [, major, minor, patch] = match;
  const majorNum = parseInt(major, 10);
  const minorNum = parseInt(minor, 10);
  const patchNum = parseInt(patch, 10);

  return {
    major: majorNum,
    minor: minorNum,
    patch: patchNum,
    num: majorNum * 1000000 + minorNum * 1000 + patchNum // For comparison
  };
}

/**
 * Build a URN from components
 * @param {Object} components - URN components
 * @returns {string} Complete URN
 */
function buildURN({ kind, authority, id, version = null }) {
  if (!VALID_KINDS.has(kind)) {
    throw new Error(`Invalid URN kind: ${kind}`);
  }

  let urn = `urn:proto:${kind}:${authority}/${id}`;
  if (version) {
    urn += `@${version}`;
  }
  return urn;
}

/**
 * Get URN kind
 * @param {string} urn - URN string
 * @returns {string|null} Kind or null
 */
function getURNKind(urn) {
  const parsed = parseURN(urn);
  return parsed ? parsed.kind : null;
}

/**
 * Get URN authority
 * @param {string} urn - URN string
 * @returns {string|null} Authority or null
 */
function getURNAuthority(urn) {
  const parsed = parseURN(urn);
  return parsed ? parsed.authority : null;
}

export {
  parseURN,
  isValidURN,
  normalizeURN,
  extractVersion,
  versionMatchesRange,
  buildURN,
  getURNKind,
  getURNAuthority,
  VALID_KINDS
};
