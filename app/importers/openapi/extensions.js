/*
 * OpenAPI Extension Handler
 *
 * Preserves valuable x-* extensions from OpenAPI specs
 * Focus on security, operational, and domain-specific metadata
 *
 * Key extensions to preserve (based on research):
 * - x-pii: Personally identifiable information markers
 * - x-rate-limit: Rate limiting configuration
 * - x-internal: Internal-only endpoints
 * - x-auth-required: Authentication requirements
 * - x-deprecation: Deprecation notices
 * - x-long-running: Long-running operation hints
 */

/**
 * List of valuable extension prefixes to preserve
 */
const VALUABLE_EXTENSIONS = [
  'x-pii',
  'x-rate-limit',
  'x-ratelimit',
  'x-internal',
  'x-auth',
  'x-security',
  'x-deprecation',
  'x-deprecated',
  'x-lifecycle',
  'x-long-running',
  'x-lro',
  'x-ms-long-running',
  'x-capability',
  'x-domain',
  'x-team',
  'x-owner',
  'x-tier',
  'x-sla',
  'x-quality',
  'x-version',
  'x-stability',
  'x-experimental',
  'x-beta',
  'x-webhook',
  'x-callback',
  'x-streaming',
  'x-cache',
  'x-idempotent',
  'x-retry',
  'x-timeout',
  'x-cost',
  'x-billing',
  'x-quota',
  'x-region',
  'x-environment',
  'x-compliance',
  'x-gdpr',
  'x-hipaa',
  'x-pci'
];

/**
 * Extract all x-* extensions from an object
 * @param {object} obj - Object to extract extensions from
 * @returns {object} Map of extension name to value
 */
function extractExtensions(obj) {
  if (!obj || typeof obj !== 'object') return {};

  const extensions = {};

  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('x-')) {
      extensions[key] = value;
    }
  }

  return extensions;
}

/**
 * Preserve only valuable x-* extensions
 * Filters extensions based on predefined valuable list
 * @param {object} obj - Object to extract extensions from
 * @returns {object} Map of valuable extension name to value
 */
function preserveValuedExtensions(obj) {
  const allExtensions = extractExtensions(obj);
  const valued = {};

  for (const [key, value] of Object.entries(allExtensions)) {
    // Check if extension matches any valuable prefix
    const isValuable = VALUABLE_EXTENSIONS.some(prefix =>
      key.toLowerCase().startsWith(prefix.toLowerCase())
    );

    if (isValuable) {
      valued[key] = value;
    }
  }

  return valued;
}

/**
 * Check if an extension indicates PII data
 * @param {object} extensions - Extension map
 * @returns {boolean} True if PII indicators found
 */
function hasPIIIndicators(extensions) {
  for (const key of Object.keys(extensions)) {
    if (key.toLowerCase().includes('pii')) {
      return true;
    }
  }
  return false;
}

/**
 * Check if an extension indicates internal-only endpoint
 * @param {object} extensions - Extension map
 * @returns {boolean} True if internal indicators found
 */
function isInternalOnly(extensions) {
  for (const [key, value] of Object.entries(extensions)) {
    if (key.toLowerCase().includes('internal') && value === true) {
      return true;
    }
  }
  return false;
}

/**
 * Extract rate limit configuration from extensions
 * @param {object} extensions - Extension map
 * @returns {object|null} Rate limit config or null
 */
function extractRateLimitConfig(extensions) {
  for (const [key, value] of Object.entries(extensions)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === 'x-rate-limit' || normalizedKey === 'x-ratelimit') {
      return value;
    }
  }
  return null;
}

/**
 * Extract authentication requirements from extensions
 * @param {object} extensions - Extension map
 * @returns {object|null} Auth config or null
 */
function extractAuthConfig(extensions) {
  for (const [key, value] of Object.entries(extensions)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.startsWith('x-auth')) {
      return { [key]: value };
    }
  }
  return null;
}

/**
 * Extract deprecation information from extensions
 * @param {object} extensions - Extension map
 * @returns {object|null} Deprecation info or null
 */
function extractDeprecationInfo(extensions) {
  const deprecation = {};

  for (const [key, value] of Object.entries(extensions)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === 'x-deprecation' || normalizedKey === 'x-deprecated') {
      if (typeof value === 'object') {
        Object.assign(deprecation, value);
      } else {
        deprecation.deprecated = value;
      }
    }
  }

  return Object.keys(deprecation).length > 0 ? deprecation : null;
}

/**
 * Extract lifecycle information from extensions
 * @param {object} extensions - Extension map
 * @returns {object|null} Lifecycle info or null
 */
function extractLifecycleInfo(extensions) {
  for (const [key, value] of Object.entries(extensions)) {
    if (key.toLowerCase() === 'x-lifecycle') {
      return value;
    }
  }
  return null;
}

/**
 * Extract stability/maturity level from extensions
 * @param {object} extensions - Extension map
 * @returns {string|null} Stability level or null
 */
function extractStabilityLevel(extensions) {
  const stabilityKeys = ['x-stability', 'x-experimental', 'x-beta'];

  for (const key of stabilityKeys) {
    if (extensions[key] !== undefined) {
      if (key === 'x-stability') {
        return extensions[key];
      } else if (extensions[key] === true) {
        return key.replace('x-', '');
      }
    }
  }

  return null;
}

/**
 * Merge extensions from multiple sources (spec-level, path-level, operation-level)
 * Operation-level extensions take precedence
 * @param {...object} extensionMaps - Extension maps to merge
 * @returns {object} Merged extensions
 */
function mergeExtensions(...extensionMaps) {
  const merged = {};

  for (const extMap of extensionMaps) {
    if (extMap && typeof extMap === 'object') {
      Object.assign(merged, extMap);
    }
  }

  return merged;
}

/**
 * Normalize extension keys to lowercase for consistent comparison
 * @param {object} extensions - Extension map
 * @returns {object} Normalized extensions
 */
function normalizeExtensionKeys(extensions) {
  const normalized = {};

  for (const [key, value] of Object.entries(extensions)) {
    const normalizedKey = key.toLowerCase();
    normalized[normalizedKey] = value;
  }

  return normalized;
}

/**
 * Get security-relevant extensions
 * @param {object} extensions - Extension map
 * @returns {object} Security-related extensions
 */
function getSecurityExtensions(extensions) {
  const security = {};
  const securityPrefixes = ['x-pii', 'x-security', 'x-auth', 'x-compliance', 'x-gdpr', 'x-hipaa', 'x-pci'];

  for (const [key, value] of Object.entries(extensions)) {
    const normalized = key.toLowerCase();
    if (securityPrefixes.some(prefix => normalized.startsWith(prefix))) {
      security[key] = value;
    }
  }

  return security;
}

/**
 * Get operational extensions (rate limits, timeouts, retries, etc.)
 * @param {object} extensions - Extension map
 * @returns {object} Operational extensions
 */
function getOperationalExtensions(extensions) {
  const operational = {};
  const operationalPrefixes = [
    'x-rate-limit',
    'x-ratelimit',
    'x-timeout',
    'x-retry',
    'x-cache',
    'x-idempotent',
    'x-cost',
    'x-quota'
  ];

  for (const [key, value] of Object.entries(extensions)) {
    const normalized = key.toLowerCase();
    if (operationalPrefixes.some(prefix => normalized.startsWith(prefix))) {
      operational[key] = value;
    }
  }

  return operational;
}

/**
 * Get domain/organizational extensions
 * @param {object} extensions - Extension map
 * @returns {object} Domain/org extensions
 */
function getDomainExtensions(extensions) {
  const domain = {};
  const domainPrefixes = [
    'x-domain',
    'x-team',
    'x-owner',
    'x-tier',
    'x-sla',
    'x-environment',
    'x-region'
  ];

  for (const [key, value] of Object.entries(extensions)) {
    const normalized = key.toLowerCase();
    if (domainPrefixes.some(prefix => normalized.startsWith(prefix))) {
      domain[key] = value;
    }
  }

  return domain;
}

/**
 * Convert extensions to API Protocol manifest metadata
 * Maps common x-* extensions to standard manifest fields
 * @param {object} extensions - Extension map
 * @returns {object} Manifest-compatible metadata
 */
function toManifestMetadata(extensions) {
  const metadata = {};

  // Lifecycle
  const lifecycle = extractLifecycleInfo(extensions);
  if (lifecycle) {
    metadata.lifecycle = lifecycle;
  } else {
    const deprecation = extractDeprecationInfo(extensions);
    if (deprecation) {
      metadata.lifecycle = { status: 'deprecated', ...deprecation };
    } else {
      const stability = extractStabilityLevel(extensions);
      if (stability) {
        metadata.lifecycle = { status: stability };
      }
    }
  }

  // Security
  const security = getSecurityExtensions(extensions);
  if (Object.keys(security).length > 0) {
    metadata.security = security;
  }

  // Operations
  const operational = getOperationalExtensions(extensions);
  if (Object.keys(operational).length > 0) {
    metadata.operational = operational;
  }

  // Domain/org
  const domain = getDomainExtensions(extensions);
  if (Object.keys(domain).length > 0) {
    metadata.domain = domain;
  }

  // Preserve remaining valuable extensions
  const remaining = {};
  for (const [key, value] of Object.entries(extensions)) {
    const normalized = key.toLowerCase();
    const alreadyCategorized =
      metadata.security?.[key] ||
      metadata.operational?.[key] ||
      metadata.domain?.[key] ||
      metadata.lifecycle;

    if (!alreadyCategorized && VALUABLE_EXTENSIONS.some(prefix => normalized.startsWith(prefix.toLowerCase()))) {
      remaining[key] = value;
    }
  }

  if (Object.keys(remaining).length > 0) {
    metadata.extensions = remaining;
  }

  return metadata;
}

module.exports = {
  VALUABLE_EXTENSIONS,
  extractExtensions,
  preserveValuedExtensions,
  hasPIIIndicators,
  isInternalOnly,
  extractRateLimitConfig,
  extractAuthConfig,
  extractDeprecationInfo,
  extractLifecycleInfo,
  extractStabilityLevel,
  mergeExtensions,
  normalizeExtensionKeys,
  getSecurityExtensions,
  getOperationalExtensions,
  getDomainExtensions,
  toManifestMetadata
};
