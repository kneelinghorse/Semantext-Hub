/*
 * Pattern Matcher for Override Rules
 *
 * Matches fields, endpoints, and data patterns against override rules.
 * Supports:
 * - String literal matching
 * - Regex pattern matching
 * - Context-aware matching
 * - Multi-field matching
 * - Performance-optimized matching (<5ms per field)
 */

const { calculateEffectiveConfidence } = require('./schema');

/**
 * Pattern matcher class
 */
class PatternMatcher {
  constructor(ruleLoader) {
    this.ruleLoader = ruleLoader;
    this.matchCache = new Map(); // Cache for repeated matches
  }

  /**
   * Match a field against PII pattern rules
   * @param {string} fieldName - Field name to match
   * @param {object} options - Matching options
   * @param {string} options.context - Context (table, endpoint, etc.)
   * @param {string} options.dataType - Data type
   * @param {array} options.sampleData - Sample data values
   * @param {string} options.protocol - Protocol hint
   * @returns {object|null} Best matching rule with effective confidence
   */
  matchPIIPattern(fieldName, options = {}) {
    const cacheKey = `pii:${fieldName}:${options.context || ''}:${options.protocol || ''}`;

    // Check cache
    if (this.matchCache.has(cacheKey)) {
      return this.matchCache.get(cacheKey);
    }

    const rules = this.ruleLoader.getRulesByType('pii_pattern');
    const matches = [];

    for (const rule of rules) {
      const match = this._matchPIIRule(rule, fieldName, options);
      if (match.matched) {
        matches.push({
          rule,
          confidence: match.confidence,
          signals: match.signals
        });
      }
    }

    // Select best match (highest confidence)
    const bestMatch = matches.length > 0
      ? matches.reduce((best, curr) => curr.confidence > best.confidence ? curr : best)
      : null;

    // Cache result
    this.matchCache.set(cacheKey, bestMatch);

    return bestMatch;
  }

  /**
   * Match against a single PII rule
   * @param {object} rule - Rule to match against
   * @param {string} fieldName - Field name
   * @param {object} options - Matching options
   * @returns {object} Match result with confidence and signals
   */
  _matchPIIRule(rule, fieldName, options) {
    const result = {
      matched: false,
      confidence: 0,
      signals: []
    };

    const pattern = rule.pattern;

    // Signal 1: Field name match
    const fieldMatch = this._matchPattern(pattern.field, fieldName);
    if (fieldMatch) {
      result.signals.push({ signal: 'field_name', weight: 0.5 });
    }

    // Signal 2: Context match (if specified)
    if (pattern.context && options.context) {
      const contextMatch = this._matchPattern(pattern.context, options.context);
      if (contextMatch) {
        result.signals.push({ signal: 'context', weight: 0.3 });
      }
    }

    // Signal 3: Data pattern match (if sample data provided)
    if (pattern.data_pattern && options.sampleData && options.sampleData.length > 0) {
      const dataMatches = this._matchDataPattern(pattern.data_pattern, options.sampleData);
      if (dataMatches > 0.5) { // >50% of samples match
        result.signals.push({ signal: 'data_format', weight: 0.4 });
      }
    }

    // Signal 4: Type hint match
    if (pattern.type_hint && options.dataType) {
      const typeMatch = pattern.type_hint.toLowerCase() === options.dataType.toLowerCase();
      if (typeMatch) {
        result.signals.push({ signal: 'type_hint', weight: 0.2 });
      }
    }

    // Signal 5: Protocol hint match
    if (rule.metadata?.protocol_hints && options.protocol) {
      const protocolMatch = rule.metadata.protocol_hints.some(hint =>
        options.protocol.toLowerCase().includes(hint.toLowerCase())
      );
      if (protocolMatch) {
        result.signals.push({ signal: 'protocol', weight: 0.3 });
      }
    }

    // Require at least one signal to match
    if (result.signals.length === 0) {
      return result;
    }

    // Calculate confidence
    const baseConfidence = calculateEffectiveConfidence(rule);
    const signalWeight = result.signals.reduce((sum, s) => sum + s.weight, 0);
    const normalizedWeight = Math.min(signalWeight, 1.0);

    result.matched = true;
    result.confidence = baseConfidence * normalizedWeight;

    return result;
  }

  /**
   * Match an API endpoint against API pattern rules
   * @param {string} endpoint - Endpoint path
   * @param {string} method - HTTP method
   * @param {object} operation - OpenAPI operation object
   * @returns {object|null} Best matching rule
   */
  matchAPIPattern(endpoint, method, operation = {}) {
    const cacheKey = `api:${method}:${endpoint}`;

    if (this.matchCache.has(cacheKey)) {
      return this.matchCache.get(cacheKey);
    }

    const rules = this.ruleLoader.getRulesByType('api_pattern');
    const matches = [];

    for (const rule of rules) {
      const match = this._matchAPIRule(rule, endpoint, method, operation);
      if (match.matched) {
        matches.push({
          rule,
          confidence: match.confidence,
          signals: match.signals
        });
      }
    }

    const bestMatch = matches.length > 0
      ? matches.reduce((best, curr) => curr.confidence > best.confidence ? curr : best)
      : null;

    this.matchCache.set(cacheKey, bestMatch);

    return bestMatch;
  }

  /**
   * Match against a single API rule
   * @param {object} rule - Rule to match against
   * @param {string} endpoint - Endpoint path
   * @param {string} method - HTTP method
   * @param {object} operation - Operation details
   * @returns {object} Match result
   */
  _matchAPIRule(rule, endpoint, method, operation) {
    const result = {
      matched: false,
      confidence: 0,
      signals: []
    };

    const pattern = rule.pattern;

    // Signal 1: Endpoint match
    if (pattern.endpoint) {
      const endpointMatch = this._matchPattern(pattern.endpoint, endpoint);
      if (endpointMatch) {
        result.signals.push({ signal: 'endpoint', weight: 0.5 });
      }
    }

    // Signal 2: Method match
    if (pattern.method) {
      const methodMatch = pattern.method.toLowerCase() === method.toLowerCase();
      if (methodMatch) {
        result.signals.push({ signal: 'method', weight: 0.3 });
      }
    }

    // Signal 3: Parameter match
    if (pattern.parameters && operation.parameters) {
      const paramMatch = this._matchParameters(pattern.parameters, operation.parameters);
      if (paramMatch) {
        result.signals.push({ signal: 'parameters', weight: 0.4 });
      }
    }

    // Signal 4: Response match
    if (pattern.response && operation.responses) {
      const responseMatch = this._matchResponse(pattern.response, operation.responses);
      if (responseMatch) {
        result.signals.push({ signal: 'response', weight: 0.3 });
      }
    }

    if (result.signals.length === 0) {
      return result;
    }

    const baseConfidence = calculateEffectiveConfidence(rule);
    const signalWeight = result.signals.reduce((sum, s) => sum + s.weight, 0);
    const normalizedWeight = Math.min(signalWeight, 1.0);

    result.matched = true;
    result.confidence = baseConfidence * normalizedWeight;

    return result;
  }

  /**
   * Match a pattern (string or regex) against a value
   * @param {string|object} pattern - Pattern to match (string or regex)
   * @param {string} value - Value to match against
   * @returns {boolean} True if matched
   */
  _matchPattern(pattern, value) {
    if (!pattern || !value) return false;

    // Regex pattern
    if (typeof pattern === 'object' && pattern.regex) {
      try {
        const regex = new RegExp(pattern.regex, pattern.flags || 'i');
        return regex.test(value);
      } catch (error) {
        return false;
      }
    }

    // String pattern (exact or contains)
    if (typeof pattern === 'string') {
      return value.toLowerCase().includes(pattern.toLowerCase());
    }

    return false;
  }

  /**
   * Match data pattern against sample data
   * @param {string|object} pattern - Data pattern (regex)
   * @param {array} sampleData - Sample values
   * @returns {number} Match rate (0.0-1.0)
   */
  _matchDataPattern(pattern, sampleData) {
    if (!pattern || !sampleData || sampleData.length === 0) return 0;

    try {
      const regex = typeof pattern === 'string' ? new RegExp(pattern) : new RegExp(pattern.regex, pattern.flags);
      let matches = 0;

      for (const value of sampleData) {
        if (value !== null && value !== undefined) {
          if (regex.test(String(value))) {
            matches++;
          }
        }
      }

      return matches / sampleData.length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Match parameters
   * @param {array} patternParams - Pattern parameters
   * @param {array} actualParams - Actual parameters
   * @returns {boolean} True if matched
   */
  _matchParameters(patternParams, actualParams) {
    if (!patternParams || patternParams.length === 0) return true;

    const actualParamNames = actualParams.map(p => p.name.toLowerCase());

    // Check if at least 50% of pattern params are present
    let matches = 0;
    for (const patternParam of patternParams) {
      if (actualParamNames.includes(patternParam.toLowerCase())) {
        matches++;
      }
    }

    return matches / patternParams.length >= 0.5;
  }

  /**
   * Match response patterns
   * @param {object} patternResponse - Pattern response
   * @param {object} actualResponses - Actual responses
   * @returns {boolean} True if matched
   */
  _matchResponse(patternResponse, actualResponses) {
    if (!patternResponse) return true;

    // Check for status code
    if (patternResponse.status) {
      return !!actualResponses[patternResponse.status];
    }

    // Check for schema properties
    if (patternResponse.properties) {
      const successResponse = actualResponses['200'] || actualResponses['201'];
      if (!successResponse) return false;

      const schema = successResponse.content?.['application/json']?.schema;
      if (!schema?.properties) return false;

      const actualProps = Object.keys(schema.properties).map(p => p.toLowerCase());
      const requiredProps = patternResponse.properties.map(p => p.toLowerCase());

      // Check if at least 50% of required props are present
      let matches = 0;
      for (const prop of requiredProps) {
        if (actualProps.includes(prop)) {
          matches++;
        }
      }

      return matches / requiredProps.length >= 0.5;
    }

    return true;
  }

  /**
   * Clear match cache
   */
  clearCache() {
    this.matchCache.clear();
  }

  /**
   * Get cache statistics
   * @returns {object} Cache stats
   */
  getCacheStats() {
    return {
      size: this.matchCache.size,
      entries: Array.from(this.matchCache.keys())
    };
  }
}

module.exports = {
  PatternMatcher
};
