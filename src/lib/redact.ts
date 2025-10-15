// Lightweight TS facade for redaction utilities
// Re-exports the production redaction helpers used by the CLI preview.

export { 
  SecretDetector,
  ManifestRedactor,
  createSafeLogger,
  containsSecrets,
  redactSecrets,
} from '../../packages/protocols/src/security/index.js';

