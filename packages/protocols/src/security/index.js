/**
 * Security Module
 * @module security
 *
 * Production-ready redaction utilities for secrets and PII protection.
 */

export {
  SecretDetector,
  ManifestRedactor,
  createSafeLogger,
  containsSecrets,
  redactSecrets,
} from './redaction.js';

export {
  CREDENTIAL_PATTERNS,
  SENSITIVE_FIELDS,
  DEFAULT_REDACTED_PATHS,
  DEFAULT_ENTROPY_THRESHOLD,
  MIN_ENTROPY_LENGTH,
  DEFAULT_PLACEHOLDER,
} from './rules.js';
