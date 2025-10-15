/**
 * Security Redaction Tests
 * @module tests/security/redaction
 */

import { describe, it, expect } from '@jest/globals';
import assert from 'node:assert/strict';
import {
  SecretDetector,
  ManifestRedactor,
  containsSecrets,
  redactSecrets,
} from '../../packages/protocols/src/security/index.js';

describe('SecretDetector', () => {
  describe('pattern-based detection', () => {
    it('detects AWS access keys', () => {
      const detector = new SecretDetector();
      const text = 'My key is AKIAIOSFODNN7EXAMPLE';
      const findings = detector.scan(text);

      assert.ok(findings.length > 0);
      assert.ok(findings.some((f) => f.name === 'aws_access_key'));
    });

    it('detects GitHub tokens', () => {
      const detector = new SecretDetector();
      const text = 'Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz';
      const findings = detector.scan(text);

      assert.ok(findings.some((f) => f.name === 'github_token'));
    });

    it('detects JWT tokens', () => {
      const detector = new SecretDetector();
      const text = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const findings = detector.scan(text);

      assert.ok(findings.some((f) => f.name === 'jwt'));
    });

    it('detects Stripe secret keys', () => {
      const detector = new SecretDetector();
      const text = 'sk_live_4eC39HqLyjWDarjtT1zdp7dc';
      const findings = detector.scan(text);

      assert.ok(findings.some((f) => f.name === 'stripe_secret'));
    });

    it('detects MongoDB connection strings', () => {
      const detector = new SecretDetector();
      const text = 'mongodb://user:pass@localhost:27017/db';
      const findings = detector.scan(text);

      assert.ok(findings.some((f) => f.name === 'mongodb_uri'));
    });

    it('detects PostgreSQL connection strings', () => {
      const detector = new SecretDetector();
      const text = 'postgresql://user:password@localhost:5432/mydb';
      const findings = detector.scan(text);

      assert.ok(findings.some((f) => f.name === 'postgresql_uri'));
    });

    it('detects SSH private key headers', () => {
      const detector = new SecretDetector();
      const text = '-----BEGIN RSA PRIVATE KEY-----';
      const findings = detector.scan(text);

      assert.ok(findings.some((f) => f.name === 'ssh_private_key'));
    });

    it('detects basic auth in URLs', () => {
      const detector = new SecretDetector();
      const text = 'https://admin:secret123@api.example.com/data';
      const findings = detector.scan(text);

      assert.ok(findings.some((f) => f.name === 'basic_auth'));
    });
  });

  describe('entropy-based detection', () => {
    it('detects high-entropy strings', () => {
      const detector = new SecretDetector(new Map(), 4.5);
      const highEntropyString = 'aB3dE9fG2hJ4kL6mN8pQ0rS1tU5vW7xY';
      const findings = detector.scan(highEntropyString);

      assert.ok(findings.some((f) => f.name === 'high_entropy'));
    });

    it('ignores low-entropy strings', () => {
      const detector = new SecretDetector(new Map(), 4.5);
      const lowEntropyString = 'aaaaaaaaaaaaaaaaaaaaaa';
      const findings = detector.scan(lowEntropyString);

      assert.ok(!findings.some((f) => f.name === 'high_entropy'));
    });

    it('ignores short strings for entropy check', () => {
      const detector = new SecretDetector(new Map(), 4.5);
      const shortString = 'aB3dE9';
      const findings = detector.scan(shortString);

      assert.ok(!findings.some((f) => f.name === 'high_entropy'));
    });
  });

  describe('redactText', () => {
    it('redacts AWS keys in text', () => {
      const detector = new SecretDetector();
      const text = 'My key is AKIAIOSFODNN7EXAMPLE and my secret is xyz';
      const redacted = detector.redactText(text);

      assert.ok(!redacted.includes('AKIAIOSFODNN7EXAMPLE'));
      assert.ok(redacted.includes('[REDACTED]'));
    });

    it('redacts multiple secrets', () => {
      const detector = new SecretDetector();
      const text = 'Key: AKIAIOSFODNN7EXAMPLE, Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz';
      const redacted = detector.redactText(text);

      assert.ok(!redacted.includes('AKIAIOSFODNN7EXAMPLE'));
      assert.ok(!redacted.includes('ghp_1234567890abcdefghijklmnopqrstuvwxyz'));
    });

    it('uses custom placeholder', () => {
      const detector = new SecretDetector();
      const text = 'Key: AKIAIOSFODNN7EXAMPLE';
      const redacted = detector.redactText(text, '***');

      assert.ok(redacted.includes('***'));
    });

    it('preserves non-secret text', () => {
      const detector = new SecretDetector();
      const text = 'This is safe text with no secrets';
      const redacted = detector.redactText(text);

      assert.equal(redacted, text);
    });
  });

  describe('entropy calculation', () => {
    it('calculates zero entropy for empty string', () => {
      const detector = new SecretDetector();
      assert.equal(detector._entropy(''), 0);
    });

    it('calculates zero entropy for single character', () => {
      const detector = new SecretDetector();
      assert.equal(detector._entropy('aaaa'), 0);
    });

    it('calculates maximum entropy for uniform distribution', () => {
      const detector = new SecretDetector();
      const entropy = detector._entropy('abcdefgh');
      assert.ok(entropy === 3); // log2(8) = 3
    });
  });
});

describe('ManifestRedactor', () => {
  describe('field-based redaction', () => {
    it('redacts password fields', () => {
      const redactor = new ManifestRedactor();
      const obj = { username: 'alice', password: 'secret123' };
      const redacted = redactor.redact(obj);

      assert.equal(redacted.username, 'alice');
      assert.equal(redacted.password, '[REDACTED]');
    });

    it('redacts token fields', () => {
      const redactor = new ManifestRedactor();
      const obj = { apiToken: 'xyz123', data: 'public' };
      const redacted = redactor.redact(obj);

      assert.equal(redacted.apiToken, '[REDACTED]');
      assert.equal(redacted.data, 'public');
    });

    it('redacts nested fields', () => {
      const redactor = new ManifestRedactor();
      const obj = {
        config: {
          apiKey: 'secret',
          endpoint: 'https://api.example.com',
        },
      };
      const redacted = redactor.redact(obj);

      assert.equal(redacted.config.apiKey, '[REDACTED]');
      assert.equal(redacted.config.endpoint, 'https://api.example.com');
    });

    it('redacts fields in arrays', () => {
      const redactor = new ManifestRedactor();
      const obj = {
        users: [
          { name: 'alice', password: 'pass1' },
          { name: 'bob', password: 'pass2' },
        ],
      };
      const redacted = redactor.redact(obj);

      assert.equal(redacted.users[0].password, '[REDACTED]');
      assert.equal(redacted.users[1].password, '[REDACTED]');
      assert.equal(redacted.users[0].name, 'alice');
    });

    it('uses custom placeholder', () => {
      const redactor = new ManifestRedactor({ placeholder: '***' });
      const obj = { password: 'secret' };
      const redacted = redactor.redact(obj);

      assert.equal(redacted.password, '***');
    });

    it('creates deep clone (does not modify original)', () => {
      const redactor = new ManifestRedactor();
      const obj = { password: 'secret', data: 'public' };
      const redacted = redactor.redact(obj);

      assert.equal(obj.password, 'secret');
      assert.equal(redacted.password, '[REDACTED]');
    });
  });

  describe('path-based redaction', () => {
    it('redacts by dot notation path', () => {
      const redactor = new ManifestRedactor();
      const obj = {
        headers: {
          authorization: 'Bearer token123',
          'content-type': 'application/json',
        },
      };
      const redacted = redactor.redactPaths(obj, ['headers.authorization']);

      assert.equal(redacted.headers.authorization, '[REDACTED]');
      assert.equal(redacted.headers['content-type'], 'application/json');
    });

    it('redacts multiple paths', () => {
      const redactor = new ManifestRedactor();
      const obj = {
        password: 'pass',
        config: { secret: 'xyz' },
      };
      const redacted = redactor.redactPaths(obj, ['password', 'config.secret']);

      assert.equal(redacted.password, '[REDACTED]');
      assert.equal(redacted.config.secret, '[REDACTED]');
    });

    it('handles missing paths gracefully', () => {
      const redactor = new ManifestRedactor();
      const obj = { data: 'public' };
      const redacted = redactor.redactPaths(obj, ['nonexistent.path']);

      assert.equal(redacted.data, 'public');
    });
  });
});

describe('utility functions', () => {
  describe('containsSecrets', () => {
    it('returns true for text with secrets', () => {
      assert.ok(containsSecrets('AKIAIOSFODNN7EXAMPLE'));
    });

    it('returns false for clean text', () => {
      assert.ok(!containsSecrets('This is safe text'));
    });
  });

  describe('redactSecrets', () => {
    it('redacts secrets with default placeholder', () => {
      const text = 'Key: AKIAIOSFODNN7EXAMPLE';
      const redacted = redactSecrets(text);

      assert.ok(!redacted.includes('AKIAIOSFODNN7EXAMPLE'));
      assert.ok(redacted.includes('[REDACTED]'));
    });

    it('redacts secrets with custom placeholder', () => {
      const text = 'Key: AKIAIOSFODNN7EXAMPLE';
      const redacted = redactSecrets(text, '***');

      assert.ok(redacted.includes('***'));
    });
  });
});
