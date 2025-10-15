/**
 * Security Redaction Rules
 * @module security/rules
 *
 * Provides precompiled patterns for detecting secrets, credentials, and PII.
 * Optimized for performance with compiled RegExp and minimal allocations.
 */

/**
 * Credential detection patterns
 * @type {Map<string, RegExp>}
 */
export const CREDENTIAL_PATTERNS = new Map([
  // AWS Keys
  ['aws_access_key', /AKIA[0-9A-Z]{16}/g],
  ['aws_secret_key', /aws_secret_access_key\s*[=:]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi],

  // GitHub
  ['github_token', /gh[poru]_[A-Za-z0-9]{36,}/g],
  ['github_classic', /github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}/g],

  // Stripe
  ['stripe_secret', /sk_live_[A-Za-z0-9]{24,}/g],
  ['stripe_restricted', /rk_live_[A-Za-z0-9]{24,}/g],

  // Generic API Keys
  ['api_key_assignment', /api[_-]?key\s*[=:]\s*["']([A-Za-z0-9_\-]{20,})["']/gi],

  // JWT Tokens
  ['jwt', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],

  // SSH Private Keys
  ['ssh_private_key', /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----/gi],

  // Connection Strings
  ['mongodb_uri', /mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi],
  ['postgresql_uri', /postgres(?:ql)?:\/\/[^\s"'<>]+/gi],
  ['mysql_uri', /mysql:\/\/[^\s"'<>]+/gi],

  // Generic Credentials
  ['basic_auth', /(?:https?:\/\/)([^:]+):([^@]+)@/gi],
  ['bearer_token', /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/gi],
]);

/**
 * High-risk field names that typically contain sensitive data
 * @type {RegExp[]}
 */
export const SENSITIVE_FIELDS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /access[_-]?key/i,
  /private[_-]?key/i,
  /credentials?/i,
  /auth/i,
  /bearer/i,
  /session/i,
  /cookie/i,
  /jwt/i,
  /connection[_-]?string/i,
  /database[_-]?url/i,
  /dsn/i,
];

/**
 * Default redacted paths for structured logging (dot notation)
 * @type {string[]}
 */
export const DEFAULT_REDACTED_PATHS = [
  'headers.authorization',
  'headers.cookie',
  'headers.x-api-key',
  'password',
  'secret',
  'token',
  'apiKey',
  'accessToken',
  'refreshToken',
  'credentials',
  'privateKey',
  'connectionString',
  'databaseUrl',
];

/**
 * Entropy threshold for detecting high-entropy strings (potential secrets)
 * Base64-encoded secrets typically have entropy > 4.5
 * @type {number}
 */
export const DEFAULT_ENTROPY_THRESHOLD = 4.5;

/**
 * Minimum length for entropy analysis
 * Shorter strings can have high entropy by chance
 * @type {number}
 */
export const MIN_ENTROPY_LENGTH = 20;

/**
 * Default placeholder for redacted values
 * @type {string}
 */
export const DEFAULT_PLACEHOLDER = '[REDACTED]';
