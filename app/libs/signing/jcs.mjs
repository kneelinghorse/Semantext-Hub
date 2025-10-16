import { Buffer } from 'node:buffer';

/**
 * Canonicalize a JSON-serializable value using RFC 8785 (JCS) rules.
 * @param {any} value
 * @returns {string}
 */
export function canonicalize(value) {
  return serialize(value);
}

/**
 * Canonicalize and return a UTF-8 buffer.
 * @param {any} value
 * @returns {Buffer}
 */
export function canonicalizeToBuffer(value) {
  return Buffer.from(canonicalize(value), 'utf8');
}

function serialize(value) {
  if (value === null) return 'null';
  const type = typeof value;

  switch (type) {
    case 'undefined':
    case 'function':
    case 'symbol':
      throw new TypeError(`Unsupported type for canonicalization: ${type}`);
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('Non-finite numbers cannot be canonicalized');
      return Number(value).toString();
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'object':
      if (Array.isArray(value)) {
        return `[${value.map((entry) => serialize(entry)).join(',')}]`;
      }
      const entries = [];
      for (const key of Object.keys(value).sort()) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        const entry = value[key];
        if (entry === undefined) continue;
        entries.push(`${JSON.stringify(key)}:${serialize(entry)}`);
      }
      return `{${entries.join(',')}}`;
    case 'bigint':
      return value.toString();
    default:
      throw new TypeError(`Unsupported type for canonicalization: ${type}`);
  }
}
