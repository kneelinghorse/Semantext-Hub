/**
 * PII Masking Utility Generator
 * Generates TypeScript PII masking utility code
 */

/**
 * Generate PII masking utility code
 * @param {object} options - Generation options
 * @param {boolean} options.typescript - Generate TypeScript (default: true)
 * @returns {string} - Generated TypeScript utility code
 */
function generatePIIMaskingUtil(options = {}) {
  const { typescript = true } = options;

  const typeAnnotations = typescript ? {
    obj: ': any',
    piiFields: ': string[]',
    return: ': any'
  } : {
    obj: '',
    piiFields: '',
    return: ''
  };

  return `/**
 * Utility to mask PII fields for safe logging
 *
 * This utility helps ensure PII is not leaked in application logs,
 * which is critical for GDPR, CCPA, and other privacy compliance.
 *
 * Usage:
 *   const event = { email: 'user@example.com', name: 'John Doe', orderId: '12345' };
 *   const safe = maskPII(event, ['email', 'name']);
 *   console.log(safe); // { email: 'u***@e***.com', name: 'J***', orderId: '12345' }
 *
 * @param obj - Object to mask PII fields in
 * @param piiFields - Array of field names to mask
 * @returns Cloned object with PII fields masked
 */
export function maskPII(obj${typeAnnotations.obj}, piiFields${typeAnnotations.piiFields})${typeAnnotations.return} {
  if (!obj || typeof obj !== 'object') return obj;

  const masked = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const field of piiFields) {
    if (field in masked) {
      const value = masked[field];
      if (typeof value === 'string') {
        // Mask email: user@example.com -> u***@e***.com
        if (value.includes('@')) {
          const [local, domain] = value.split('@');
          const domainParts = domain.split('.');
          masked[field] = local[0] + '***@' + domainParts[0][0] + '***.' + domainParts.slice(1).join('.');
        } else if (value.length > 0) {
          // Mask other strings: show first char only
          masked[field] = value[0] + '*'.repeat(Math.min(value.length - 1, 8));
        } else {
          masked[field] = '[REDACTED]';
        }
      } else if (typeof value === 'number') {
        // Mask numbers: show last 4 digits only
        const numStr = value.toString();
        if (numStr.length > 4) {
          masked[field] = '***' + numStr.slice(-4);
        } else {
          masked[field] = '****';
        }
      } else {
        masked[field] = '[REDACTED]';
      }
    }
  }

  return masked;
}

/**
 * Check if a field name suggests it contains PII
 *
 * This is a heuristic check based on common naming patterns.
 * Always prefer explicit PII field declarations in your protocol manifests.
 *
 * @param fieldName - Field name to check
 * @returns True if field name suggests PII
 */
export function isPIIFieldName(fieldName${typescript ? ': string' : ''})${typescript ? ': boolean' : ''} {
  const lowerField = fieldName.toLowerCase();

  const piiPatterns = [
    'email', 'mail', 'phone', 'telephone', 'mobile',
    'ssn', 'social', 'tax', 'passport',
    'address', 'street', 'city', 'zip', 'postal',
    'name', 'firstname', 'lastname', 'fullname',
    'dob', 'birthdate', 'birthday',
    'ip', 'ipaddress',
    'credit', 'card', 'account', 'bank',
    'password', 'secret', 'token', 'key'
  ];

  return piiPatterns.some(pattern => lowerField.includes(pattern));
}
`;
}

module.exports = { generatePIIMaskingUtil };
