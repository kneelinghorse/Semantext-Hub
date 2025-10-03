/**
 * Semantic URN generation with separate version management
 * Format: urn:events:{domain}:{entity}:{action}
 * Research: 9/10 stability rating vs 6-7/10 for version-in-identifier
 */

/**
 * Generate semantic event URN from channel and document
 * @param {Object} channel - AsyncAPI channel object
 * @param {Object} document - AsyncAPI document
 * @returns {string} Semantic event URN
 */
function generateEventURN(channel, document) {
  const info = document.info();
  const channelId = channel.id();

  // Extract semantic components from channel ID
  const { domain, entity, action } = parseChannelSemantics(channelId, info);

  // Generate semantic URN (version managed separately)
  return `urn:events:${domain}:${entity}:${action}`;
}

/**
 * Parse channel semantics to extract domain, entity, and action
 * @param {string} channelId - Channel identifier
 * @param {Object} info - AsyncAPI info object
 * @returns {Object} { domain, entity, action }
 */
function parseChannelSemantics(channelId, info) {
  // Normalize channel ID: remove params, special chars
  const normalized = channelId
    .replace(/\{[^}]*\}/g, '')           // Remove parameter braces
    .replace(/[^a-z0-9/-_.]/gi, '/')     // Replace special chars with /
    .replace(/\/+/g, '/')                // Collapse slashes
    .replace(/^\/|\/$/g, '')             // Trim edges
    .toLowerCase();

  // Split into parts
  const parts = normalized.split(/[/._-]/);

  // Heuristic: determine domain, entity, action
  let domain, entity, action;

  if (parts.length === 1) {
    // Single part: use as entity, infer domain from spec title
    domain = sanitizeDomain(info.title());
    entity = parts[0];
    action = 'event';
  } else if (parts.length === 2) {
    // Two parts: entity.action pattern
    domain = sanitizeDomain(info.title());
    entity = parts[0];
    action = parts[1];
  } else {
    // Three+ parts: domain/entity/action or entity/sub/action
    // Use first as domain if it's generic, otherwise infer from title
    const genericDomains = ['api', 'app', 'service', 'system', 'events', 'event'];
    if (genericDomains.includes(parts[0])) {
      domain = sanitizeDomain(info.title());
      entity = parts[1];
      action = parts.slice(2).join('-') || 'event';
    } else {
      domain = parts[0];
      entity = parts[1];
      action = parts.slice(2).join('-') || 'event';
    }
  }

  return {
    domain: domain || 'default',
    entity: entity || 'unknown',
    action: action || 'event'
  };
}

/**
 * Sanitize domain name for URN compatibility
 * @param {string} title - Document title
 * @returns {string} Sanitized domain
 */
function sanitizeDomain(title) {
  if (!title) return 'default';

  return title
    .toLowerCase()
    .replace(/\s+/g, '-')                // Replace spaces with hyphens
    .replace(/[^a-z0-9-]/g, '')          // Remove invalid chars
    .replace(/-+/g, '-')                 // Collapse hyphens
    .replace(/^-|-$/g, '')               // Trim edges
    .substring(0, 32)                    // Limit length
    || 'default';
}

/**
 * Extract version information (stored separately from URN)
 * @param {Object} document - AsyncAPI document
 * @param {Object} message - Message object
 * @returns {Object} Version information
 */
function extractVersion(document, message) {
  const messageData = message.json ? message.json() : message;

  return {
    schema_version: messageData.version || document.info().version() || '1.0.0',
    dataschema: messageData.schemaFormat
      ? `https://schemas.example.com/${messageData.schemaFormat}`
      : null
  };
}

/**
 * Parse URN into components
 * @param {string} urn - Event URN
 * @returns {Object} Parsed URN components
 */
function parseURN(urn) {
  const parts = urn.split(':');

  if (parts.length !== 5 || parts[0] !== 'urn' || parts[1] !== 'events') {
    throw new Error(`Invalid event URN format: ${urn}`);
  }

  return {
    scheme: parts[0],
    namespace: parts[1],
    domain: parts[2],
    entity: parts[3],
    action: parts[4]
  };
}

/**
 * Validate URN format
 * @param {string} urn - Event URN
 * @returns {boolean} True if valid
 */
function validateURN(urn) {
  try {
    parseURN(urn);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Generate URN from components
 * @param {Object} components - URN components
 * @returns {string} Generated URN
 */
function buildURN(components) {
  const { domain, entity, action } = components;

  if (!domain || !entity || !action) {
    throw new Error('Missing required URN components: domain, entity, action');
  }

  return `urn:events:${domain}:${entity}:${action}`;
}

/**
 * Suggest alternative URN based on channel description
 * @param {Object} channel - AsyncAPI channel object
 * @param {Object} document - AsyncAPI document
 * @returns {Array} Array of suggested URNs with confidence scores
 */
function suggestURNs(channel, document) {
  const suggestions = [];

  // Primary suggestion from channel ID
  const primaryURN = generateEventURN(channel, document);
  suggestions.push({ urn: primaryURN, confidence: 0.9, source: 'channel_id' });

  // Alternative suggestion from description
  const description = channel.description();
  if (description) {
    const descWords = description
      .toLowerCase()
      .match(/\b(created|updated|deleted|changed|added|removed|sent|received)\b/);

    if (descWords) {
      const { domain, entity } = parseChannelSemantics(channel.id(), document.info());
      const action = descWords[0];
      const altURN = `urn:events:${domain}:${entity}:${action}`;

      if (altURN !== primaryURN) {
        suggestions.push({ urn: altURN, confidence: 0.7, source: 'description' });
      }
    }
  }

  return suggestions;
}

module.exports = {
  generateEventURN,
  parseChannelSemantics,
  sanitizeDomain,
  extractVersion,
  parseURN,
  validateURN,
  buildURN,
  suggestURNs
};
