/*
 * Override Rule Schema
 *
 * Defines the structure and validation for community-contributed
 * override rules that enhance protocol discovery patterns.
 *
 * Rule Types:
 * - pii_pattern: PII detection enhancements
 * - api_pattern: API pattern recognition (pagination, LRO, etc.)
 * - classification: Field classification overrides
 * - data_format: Data format detection rules
 */

/**
 * Rule schema definition
 */
const RULE_SCHEMA = {
  // Required fields
  id: 'string',              // Unique identifier (e.g., "stripe-customer-email")
  type: 'string',            // Rule type: pii_pattern, api_pattern, classification, data_format
  pattern: 'object',         // Pattern matching criteria
  classification: 'string',  // Classification result (pii, sensitive, public, etc.)
  confidence: 'number',      // Base confidence score (0.0-1.0)

  // Optional metadata
  metadata: {
    source: 'string',        // Source: community, organization, project
    author: 'string',        // Author/contributor
    created: 'string',       // ISO date string
    updated: 'string',       // ISO date string
    verified_by: 'number',   // Number of verifications
    description: 'string',   // Human-readable description
    tags: 'array',           // Tags for categorization
    protocol_hints: 'array'  // Related protocols (e.g., ["stripe", "payment"])
  }
};

/**
 * Rule types with their specific pattern structures
 */
const RULE_TYPES = {
  pii_pattern: {
    pattern: {
      field: 'string|regex',     // Field name or pattern
      context: 'string',         // Optional context (table, endpoint, etc.)
      data_pattern: 'regex',     // Optional data format pattern
      type_hint: 'string'        // Optional data type hint
    }
  },

  api_pattern: {
    pattern: {
      endpoint: 'string|regex',  // Endpoint pattern
      method: 'string',          // HTTP method
      parameters: 'array',       // Parameter patterns
      response: 'object'         // Response patterns
    }
  },

  classification: {
    pattern: {
      field: 'string|regex',     // Field name or pattern
      context: 'string',         // Context identifier
      value_pattern: 'regex'     // Optional value pattern
    }
  },

  data_format: {
    pattern: {
      format: 'string',          // Format identifier (email, phone, uuid, etc.)
      regex: 'string',           // Regex pattern
      validator: 'string'        // Optional validator function name
    }
  }
};

/**
 * Precedence levels
 */
const PRECEDENCE = {
  PROJECT: 3,       // Highest - local .proto/overrides/
  ORGANIZATION: 2,  // Middle - org repository
  COMMUNITY: 1      // Lowest - public community packs
};

/**
 * Confidence decay windows (in days)
 */
const DECAY_WINDOWS = {
  FRESH: { max: 30, multiplier: 1.0 },    // 0-30 days: 100%
  RECENT: { max: 60, multiplier: 0.9 },   // 30-60 days: 90%
  AGING: { max: 90, multiplier: 0.8 },    // 60-90 days: 80%
  OLD: { max: Infinity, multiplier: 0.7 } // 90+ days: 70%
};

/**
 * Validate rule structure
 * @param {object} rule - Rule to validate
 * @returns {object} { valid: boolean, errors: array }
 */
function validateRule(rule) {
  const errors = [];

  // Required fields
  if (!rule.id || typeof rule.id !== 'string') {
    errors.push('Missing or invalid field: id');
  }

  if (!rule.type || !Object.keys(RULE_TYPES).includes(rule.type)) {
    errors.push(`Invalid rule type: ${rule.type}. Must be one of: ${Object.keys(RULE_TYPES).join(', ')}`);
  }

  if (!rule.pattern || typeof rule.pattern !== 'object') {
    errors.push('Missing or invalid field: pattern');
  }

  if (!rule.classification || typeof rule.classification !== 'string') {
    errors.push('Missing or invalid field: classification');
  }

  if (typeof rule.confidence !== 'number' || rule.confidence < 0 || rule.confidence > 1) {
    errors.push('Invalid confidence: must be number between 0.0 and 1.0');
  }

  // Validate pattern structure for rule type
  if (rule.type && RULE_TYPES[rule.type]) {
    const typeSchema = RULE_TYPES[rule.type].pattern;
    const requiredFields = Object.keys(typeSchema);

    // Check if pattern has at least one required field
    const hasRequiredField = requiredFields.some(field =>
      rule.pattern && rule.pattern[field] !== undefined
    );

    if (!hasRequiredField) {
      errors.push(`Pattern missing required fields for type ${rule.type}: ${requiredFields.join(', ')}`);
    }
  }

  // Validate metadata if present
  if (rule.metadata) {
    if (rule.metadata.source && !['community', 'organization', 'project'].includes(rule.metadata.source)) {
      errors.push('Invalid metadata.source: must be community, organization, or project');
    }

    if (rule.metadata.created && isNaN(Date.parse(rule.metadata.created))) {
      errors.push('Invalid metadata.created: must be valid ISO date string');
    }

    if (rule.metadata.verified_by !== undefined && typeof rule.metadata.verified_by !== 'number') {
      errors.push('Invalid metadata.verified_by: must be number');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculate temporal decay multiplier
 * @param {string} createdDate - ISO date string
 * @returns {number} Decay multiplier (0.7-1.0)
 */
function calculateDecay(createdDate) {
  if (!createdDate) return DECAY_WINDOWS.OLD.multiplier;

  const created = new Date(createdDate);
  const now = new Date();
  const ageInDays = Math.floor((now - created) / (1000 * 60 * 60 * 24));

  if (ageInDays <= DECAY_WINDOWS.FRESH.max) return DECAY_WINDOWS.FRESH.multiplier;
  if (ageInDays <= DECAY_WINDOWS.RECENT.max) return DECAY_WINDOWS.RECENT.multiplier;
  if (ageInDays <= DECAY_WINDOWS.AGING.max) return DECAY_WINDOWS.AGING.multiplier;
  return DECAY_WINDOWS.OLD.multiplier;
}

/**
 * Calculate effective confidence with decay and verification boost
 * @param {object} rule - Rule with confidence and metadata
 * @returns {number} Effective confidence (0.0-1.0)
 */
function calculateEffectiveConfidence(rule) {
  let confidence = rule.confidence || 0;

  // Apply temporal decay
  const decayMultiplier = calculateDecay(rule.metadata?.created);
  confidence *= decayMultiplier;

  // Apply verification boost (each verification adds 0.5%, max 10%)
  if (rule.metadata?.verified_by) {
    const verificationBoost = Math.min(rule.metadata.verified_by * 0.005, 0.10);
    confidence = Math.min(confidence + verificationBoost, 1.0);
  }

  return Math.min(confidence, 1.0);
}

/**
 * Get precedence level for rule source
 * @param {string} source - Rule source (community, organization, project)
 * @returns {number} Precedence level
 */
function getPrecedence(source) {
  const upperSource = (source || 'community').toUpperCase();
  return PRECEDENCE[upperSource] || PRECEDENCE.COMMUNITY;
}

module.exports = {
  RULE_SCHEMA,
  RULE_TYPES,
  PRECEDENCE,
  DECAY_WINDOWS,
  validateRule,
  calculateDecay,
  calculateEffectiveConfidence,
  getPrecedence
};
