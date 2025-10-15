/**
 * Security Redaction Core
 * @module security/redaction
 *
 * Provides fast, configurable redaction for secrets, credentials, and PII.
 * Designed for minimal allocations and streaming-safe operation.
 */

import {
  CREDENTIAL_PATTERNS,
  SENSITIVE_FIELDS,
  DEFAULT_ENTROPY_THRESHOLD,
  MIN_ENTROPY_LENGTH,
  DEFAULT_PLACEHOLDER,
} from './rules.js';

/**
 * Finding from secret detection
 * @typedef {Object} SecretFinding
 * @property {string} name - Pattern name that matched
 * @property {number} index - Start position in text
 * @property {string} [value] - Matched value (may be redacted)
 */

/**
 * Secret detector using pattern matching and entropy analysis
 */
export class SecretDetector {
  /**
   * @param {Map<string, RegExp>} [patterns=CREDENTIAL_PATTERNS] - Detection patterns
   * @param {number} [entropyThreshold=DEFAULT_ENTROPY_THRESHOLD] - Minimum entropy for flagging
   */
  constructor(patterns = CREDENTIAL_PATTERNS, entropyThreshold = DEFAULT_ENTROPY_THRESHOLD) {
    this.patterns = patterns;
    this.entropyThreshold = entropyThreshold;
  }

  /**
   * Scan text for secrets and high-entropy strings
   * @param {string} text - Text to scan
   * @returns {SecretFinding[]} Array of findings
   */
  scan(text) {
    const findings = [];

    // Pattern-based detection
    for (const [name, rx] of this.patterns) {
      rx.lastIndex = 0; // Reset regex state
      let m;
      while ((m = rx.exec(text))) {
        findings.push({
          name,
          index: m.index,
          value: m[0],
        });
      }
    }

    // Entropy-based detection for long strings
    if (text.length >= MIN_ENTROPY_LENGTH) {
      const entropy = this._entropy(text);
      if (entropy >= this.entropyThreshold) {
        findings.push({
          name: 'high_entropy',
          index: 0,
          value: text.substring(0, 50), // Sample only
        });
      }
    }

    return findings;
  }

  /**
   * Calculate Shannon entropy of a string
   * @private
   * @param {string} s - String to analyze
   * @returns {number} Entropy in bits
   */
  _entropy(s) {
    if (!s || s.length === 0) return 0;

    const freq = new Map();
    for (const c of s) {
      freq.set(c, (freq.get(c) || 0) + 1);
    }

    let H = 0;
    const len = s.length;
    for (const count of freq.values()) {
      const p = count / len;
      H -= p * Math.log2(p);
    }

    return H;
  }

  /**
   * Redact secrets in text using placeholder
   * @param {string} text - Text to redact
   * @param {string} [placeholder=DEFAULT_PLACEHOLDER] - Replacement string
   * @returns {string} Redacted text
   */
  redactText(text, placeholder = DEFAULT_PLACEHOLDER) {
    let result = text;
    const findings = this.scan(text);

    // Sort by index descending to replace from end to start (preserve indices)
    findings.sort((a, b) => b.index - a.index);

    for (const finding of findings) {
      if (finding.value && finding.name !== 'high_entropy') {
        const start = finding.index;
        const end = start + finding.value.length;
        result = result.substring(0, start) + placeholder + result.substring(end);
      }
    }

    return result;
  }
}

/**
 * Manifest and structured data redactor
 */
export class ManifestRedactor {
  /**
   * @param {Object} [options] - Configuration
   * @param {RegExp[]} [options.fields=SENSITIVE_FIELDS] - Field patterns to redact
   * @param {string} [options.placeholder=DEFAULT_PLACEHOLDER] - Replacement value
   */
  constructor({ fields = SENSITIVE_FIELDS, placeholder = DEFAULT_PLACEHOLDER } = {}) {
    this.fields = fields;
    this.placeholder = placeholder;
  }

  /**
   * Redact sensitive fields in object (returns deep clone)
   * @param {any} obj - Object to redact
   * @returns {any} Redacted clone
   */
  redact(obj) {
    const walk = (o) => {
      if (!o || typeof o !== 'object') return o;

      if (Array.isArray(o)) {
        return o.map((item) => walk(item));
      }

      const result = {};
      for (const key of Object.keys(o)) {
        const shouldRedact = this.fields.some((rx) => rx.test(key));

        if (shouldRedact) {
          result[key] = typeof o[key] === 'string' ? this.placeholder : this.placeholder;
        } else {
          result[key] = walk(o[key]);
        }
      }

      return result;
    };

    return walk(structuredClone(obj));
  }

  /**
   * Redact by dot-notation paths (e.g., 'headers.authorization')
   * @param {any} obj - Object to redact
   * @param {string[]} paths - Paths to redact
   * @param {string} [placeholder] - Replacement value
   * @returns {any} Redacted clone
   */
  redactPaths(obj, paths, placeholder = this.placeholder) {
    const clone = structuredClone(obj);

    for (const path of paths) {
      const parts = path.split('.');
      let current = clone;

      for (let i = 0; i < parts.length - 1; i++) {
        if (!current || typeof current !== 'object') break;
        current = current[parts[i]];
      }

      if (current && typeof current === 'object') {
        const lastKey = parts[parts.length - 1];
        if (lastKey in current) {
          current[lastKey] = placeholder;
        }
      }
    }

    return clone;
  }
}

/**
 * Create a safe logger with automatic redaction
 * @param {Object} [options] - Configuration
 * @param {string[]} [options.redactedPaths] - Paths to redact in logs
 * @param {string} [options.placeholder] - Replacement value
 * @returns {Object} Logger interface
 */
export function createSafeLogger({
  redactedPaths = [
    'headers.authorization',
    'headers.cookie',
    'password',
    'secret',
    'token',
  ],
  placeholder = DEFAULT_PLACEHOLDER,
} = {}) {
  const redactor = new ManifestRedactor({ placeholder });

  const redactLog = (args) => {
    return args.map((arg) => {
      if (arg && typeof arg === 'object') {
        return redactor.redactPaths(arg, redactedPaths, placeholder);
      }
      return arg;
    });
  };

  return {
    info: (...args) => console.log(...redactLog(args)),
    warn: (...args) => console.warn(...redactLog(args)),
    error: (...args) => console.error(...redactLog(args)),
    debug: (...args) => console.debug(...redactLog(args)),
  };
}

/**
 * Fast utility to check if text contains potential secrets
 * @param {string} text - Text to check
 * @returns {boolean} True if secrets detected
 */
export function containsSecrets(text) {
  for (const [, rx] of CREDENTIAL_PATTERNS) {
    rx.lastIndex = 0;
    if (rx.test(text)) return true;
  }
  return false;
}

/**
 * Redact secrets in a single pass (convenience function)
 * @param {string} text - Text to redact
 * @param {string} [placeholder] - Replacement string
 * @returns {string} Redacted text
 */
export function redactSecrets(text, placeholder = DEFAULT_PLACEHOLDER) {
  const detector = new SecretDetector();
  return detector.redactText(text, placeholder);
}
