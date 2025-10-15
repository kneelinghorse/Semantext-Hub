/**
 * Three-tier PII detection for event payloads
 * Research: 81-87% baseline accuracy with confidence-based scoring
 */

const { traverseSchema } = require('./schema-utils');

function normalizeFieldName(fieldName) {
  if (!fieldName) return '';

  return fieldName
    .replace(/\[\]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9._-]/gi, '_')
    .toLowerCase();
}

function getFieldTokens(fieldName) {
  return normalizeFieldName(fieldName)
    .split(/[._-]/)
    .filter(Boolean);
}

/**
 * Detect PII fields in event messages using three-tier confidence scoring
 * @param {Array} messages - Array of AsyncAPI message objects
 * @param {Object} channel - AsyncAPI channel object
 * @returns {Promise<Array>} Array of PII field detections
 */
async function detectEventPII(messages, channel) {
  const allFields = [];

  for (const message of messages) {
    const payload = message.payload();
    if (!payload) continue;

    const fields = traverseSchema(payload, (field, path) => {
      // Check exclusion patterns first
      if (matchesExclusionPattern(path)) {
        return null;
      }

      // Check for x-pii schema annotation (explicit PII declaration)
      const fieldData = field.json ? field.json() : field;
      if (fieldData['x-pii']) {
        return {
          path: path,
          confidence: 0.99,
          tier: 'explicit',
          category: 'schema_annotation',
          type: extractType(field),
          required: extractRequired(field),
          description: extractDescription(field)
        };
      }

      // Tier 1: Definite PII (95%+ confidence)
      const definitePII = matchDefinitePII(path);
      if (definitePII) {
        return {
          path: path,
          confidence: definitePII.confidence,
          tier: 'definite',
          category: definitePII.category,
          type: extractType(field),
          required: extractRequired(field),
          description: extractDescription(field)
        };
      }

      // Tier 2: Potential PII (85-94% confidence)
      const potentialPII = matchPotentialPII(path);
      if (potentialPII) {
        return {
          path: path,
          confidence: potentialPII.confidence,
          tier: 'potential',
          category: potentialPII.category,
          type: extractType(field),
          required: extractRequired(field),
          description: extractDescription(field)
        };
      }

      // Tier 3: Contextual PII (70-84% confidence)
      const contextualPII = matchContextualPII(path);
      if (contextualPII) {
        return {
          path: path,
          confidence: contextualPII.confidence,
          tier: 'contextual',
          category: contextualPII.category,
          type: extractType(field),
          required: extractRequired(field),
          description: extractDescription(field)
        };
      }

      return null;
    });

    // Ensure fields is an array before spreading
    if (Array.isArray(fields)) {
      allFields.push(...fields.filter(Boolean));
    }
  }

  // Apply channel context boost (user/payment/health channels)
  const channelMultiplier = analyzeChannelContext(channel.id());
  if (channelMultiplier) {
    allFields.forEach(f => {
      if (f.tier !== 'explicit') {
        f.confidence = Math.min(f.confidence * channelMultiplier.multiplier, 1.0);
      }
      f.channel_boost = channelMultiplier.reason;
    });
  }

  // Filter out low-confidence detections (below 60%)
  return allFields.filter(f => f.confidence > 0.6);
}

/**
 * Check if field name matches exclusion patterns (system fields)
 * @param {string} fieldName - Field name to check
 * @returns {boolean} True if field should be excluded
 */
function matchesExclusionPattern(fieldName) {
  const tokens = getFieldTokens(fieldName);
  if (tokens.length === 0) {
    return false;
  }

  const terminal = tokens[tokens.length - 1];
  const exclusions = new Set([
    'timestamp',
    'created',
    'created_at',
    'updated',
    'updated_at',
    'status',
    'type',
    'metadata',
    'version',
    'schema',
    'event_type'
  ]);

  if (exclusions.has(terminal)) {
    return true;
  }

  const leading = tokens[0];
  if (['event', 'message', 'system', 'device', 'product'].includes(leading) && tokens.length === 1) {
    return true;
  }

  return false;
}

/**
 * Match Tier 1: Definite PII patterns (95%+ confidence)
 * @param {string} fieldName - Field name to check
 * @returns {Object|null} Match result or null
 */
function matchDefinitePII(fieldName) {
  const normalized = normalizeFieldName(fieldName);
  const tokens = getFieldTokens(fieldName);
  const tokenSet = new Set(tokens);
  const collapsed = normalized.replace(/[^a-z0-9]/g, '');

  if (normalized.includes('email') || tokenSet.has('email') || collapsed.includes('email')) {
    return { confidence: 0.95, category: 'email' };
  }

  if (['phone', 'telephone', 'mobile', 'cell', 'tel'].some(t => tokenSet.has(t) || normalized.includes(t))) {
    return { confidence: 0.95, category: 'phone' };
  }

  if ([
    'ssn',
    'social_security',
    'tax_id',
    'tin',
    'national_id'
  ].some(t => normalized.includes(t))) {
    return { confidence: 0.95, category: 'government_id' };
  }

  const hasCard = tokenSet.has('card') || normalized.includes('creditcard');
  const hasCredit = tokenSet.has('credit') || tokenSet.has('cc');
  if (hasCard && (hasCredit || tokenSet.has('number'))) {
    return { confidence: 0.95, category: 'payment' };
  }

  if ([
    'password',
    'pwd',
    'passcode',
    'secret',
    'apikey',
    'api_key',
    'token'
  ].some(t => normalized.includes(t))) {
    return { confidence: 0.95, category: 'credential' };
  }

  return null;
}

/**
 * Match Tier 2: Potential PII patterns (85-94% confidence)
 * @param {string} fieldName - Field name to check
 * @returns {Object|null} Match result or null
 */
function matchPotentialPII(fieldName) {
  const normalized = normalizeFieldName(fieldName);
  const tokens = getFieldTokens(fieldName);
  const tokenSet = new Set(tokens);

  const hasNameToken = tokenSet.has('name') || tokenSet.has('fullname') || tokenSet.has('firstname') || tokenSet.has('lastname') || tokenSet.has('givenname') || tokenSet.has('surname');
  const hasCompositeName = (tokenSet.has('first') && tokenSet.has('name')) || (tokenSet.has('last') && tokenSet.has('name'));
  const hasUsername = tokenSet.has('username') || normalized.includes('user_name');
  if (hasNameToken || hasCompositeName || hasUsername) {
    return { confidence: 0.85, category: 'name' };
  }

  const addressTokens = ['address', 'street', 'city', 'zipcode', 'zip_code', 'postalcode', 'postal_code', 'postcode', 'country', 'state', 'province'];
  if (addressTokens.some(token => tokenSet.has(token) || normalized.includes(token))) {
    return { confidence: 0.85, category: 'address' };
  }

  const birthTokens = ['birthdate', 'date_of_birth', 'dob', 'birth_day'];
  if (birthTokens.some(token => normalized.includes(token)) || tokenSet.has('age')) {
    return { confidence: 0.9, category: 'date_of_birth' };
  }

  const accountTokens = ['accountnumber', 'account_id', 'accountid', 'iban', 'swift', 'routing', 'bankaccount'];
  if (accountTokens.some(token => normalized.includes(token))) {
    return { confidence: 0.85, category: 'financial' };
  }

  // Secondary check for tokens containing both "address" and a component
  if (tokenSet.has('address') && tokens.some(t => ['street', 'city', 'zipcode', 'postal', 'country', 'state', 'province'].includes(t))) {
    return { confidence: 0.85, category: 'address' };
  }

  return null;
}

/**
 * Match Tier 3: Contextual PII patterns (70-84% confidence)
 * @param {string} fieldName - Field name to check
 * @returns {Object|null} Match result or null
 */
function matchContextualPII(fieldName) {
  const normalized = normalizeFieldName(fieldName);
  const tokens = getFieldTokens(fieldName);
  const tokenSet = new Set(tokens);

  const identityRoots = ['user', 'customer', 'member', 'account', 'client', 'profile'];
  if (tokenSet.has('id') && identityRoots.some(root => tokenSet.has(root) || normalized.includes(`${root}_id`) || normalized.endsWith(`${root}id`))) {
    return { confidence: 0.7, category: 'identifier' };
  }

  const ipTokens = ['ipaddress', 'ip_address', 'ip', 'clientip'];
  if (ipTokens.some(token => normalized.includes(token))) {
    return { confidence: 0.7, category: 'network' };
  }

  const geoTokens = ['latitude', 'longitude', 'lat', 'lng', 'coordinates', 'location', 'geo', 'geolocation'];
  if (geoTokens.some(token => normalized.includes(token))) {
    return { confidence: 0.75, category: 'geolocation' };
  }

  return null;
}

/**
 * Analyze channel context for PII likelihood boost
 * @param {string} channelId - Channel identifier
 * @returns {Object|null} Context multiplier or null
 */
function analyzeChannelContext(channelId) {
  const healthChannels = /\b(health|medical|patient|hipaa|clinical)\b/i;
  const paymentChannels = /\b(payment|billing|invoice|transaction|purchase|checkout)\b/i;
  const userChannels = /\b(user|customer|account|profile|identity|auth|registration)\b/i;

  if (healthChannels.test(channelId)) {
    return { multiplier: 1.3, reason: 'Health-related channel' };
  } else if (paymentChannels.test(channelId)) {
    return { multiplier: 1.2, reason: 'Payment-related channel' };
  } else if (userChannels.test(channelId)) {
    return { multiplier: 1.15, reason: 'User-related channel' };
  }

  return null;
}

/**
 * Extract type from field object
 * @param {Object} field - Field object
 * @returns {string} Field type
 */
function extractType(field) {
  try {
    if (field.type && typeof field.type === 'function') {
      return field.type();
    }
    const fieldData = field.json ? field.json() : field;
    return fieldData.type || 'unknown';
  } catch (error) {
    return 'unknown';
  }
}

/**
 * Extract required status from field object
 * @param {Object} field - Field object
 * @returns {boolean} Required status
 */
function extractRequired(field) {
  try {
    const fieldData = field.json ? field.json() : field;
    return fieldData.required || false;
  } catch (error) {
    return false;
  }
}

/**
 * Extract description from field object
 * @param {Object} field - Field object
 * @returns {string|undefined} Field description
 */
function extractDescription(field) {
  try {
    if (field.description && typeof field.description === 'function') {
      return field.description();
    }
    const fieldData = field.json ? field.json() : field;
    return fieldData.description;
  } catch (error) {
    return undefined;
  }
}

module.exports = {
  detectEventPII,
  matchesExclusionPattern,
  matchDefinitePII,
  matchPotentialPII,
  matchContextualPII,
  analyzeChannelContext
};
