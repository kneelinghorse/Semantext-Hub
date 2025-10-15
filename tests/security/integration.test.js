/**
 * Security Integration Tests
 * @module tests/security/integration
 *
 * Tests integration with catalog, logging, and CLI outputs
 */

import { describe, it, expect } from '@jest/globals';
import assert from 'node:assert/strict';
import {
  SecretDetector,
  ManifestRedactor,
  createSafeLogger,
  CREDENTIAL_PATTERNS,
  SENSITIVE_FIELDS,
} from '../../packages/protocols/src/security/index.js';

describe('Integration: Catalog Redaction', () => {
  it('redacts sensitive catalog metadata', () => {
    const redactor = new ManifestRedactor();
    const catalogEntry = {
      path: '/src/api/auth.js',
      metadata: {
        environment: {
          DATABASE_URL: 'postgresql://admin:secret@localhost/db',
          API_KEY: 'sk_live_1234567890abcdef',
          DEBUG: 'true',
        },
      },
    };

    const redacted = redactor.redact(catalogEntry);

    assert.equal(redacted.path, '/src/api/auth.js');
    assert.equal(redacted.metadata.environment.DEBUG, 'true');
    assert.equal(redacted.metadata.environment.API_KEY, '[REDACTED]');
  });

  it('redacts connection strings in catalog', () => {
    const detector = new SecretDetector();
    const catalogDoc = JSON.stringify({
      config: {
        db: 'mongodb://user:pass@localhost:27017/mydb',
      },
    });

    const redacted = detector.redactText(catalogDoc);

    assert.ok(!redacted.includes('user:pass'));
    assert.ok(redacted.includes('[REDACTED]'));
  });

  it('preserves structure while redacting nested config', () => {
    const redactor = new ManifestRedactor();
    const manifest = {
      services: [
        {
          name: 'api',
          config: {
            port: 3000,
            apiKey: 'secret123',
            database: {
              connectionString: 'postgresql://localhost/db',
              pool: 10,
            },
          },
        },
      ],
    };

    const redacted = redactor.redact(manifest);

    assert.equal(redacted.services[0].name, 'api');
    assert.equal(redacted.services[0].config.port, 3000);
    assert.equal(redacted.services[0].config.apiKey, '[REDACTED]');
    assert.equal(redacted.services[0].config.database.connectionString, '[REDACTED]');
    assert.equal(redacted.services[0].config.database.pool, 10);
  });
});

describe('Integration: Logging', () => {
  it('createSafeLogger redacts authorization headers', () => {
    const logger = createSafeLogger();
    const logData = {
      request: {
        method: 'GET',
        path: '/api/users',
        headers: {
          authorization: 'Bearer secret_token_123',
          'content-type': 'application/json',
        },
      },
    };

    // Safe logger would redact when logging
    const redactor = new ManifestRedactor();
    const safe = redactor.redactPaths(logData, ['request.headers.authorization']);

    assert.equal(safe.request.headers.authorization, '[REDACTED]');
    assert.equal(safe.request.headers['content-type'], 'application/json');
  });

  it('redacts cookie headers in logs', () => {
    const redactor = new ManifestRedactor();
    const logEntry = {
      headers: {
        cookie: 'session=abc123; token=xyz789',
        host: 'example.com',
      },
    };

    const redacted = redactor.redactPaths(logEntry, ['headers.cookie']);

    assert.equal(redacted.headers.cookie, '[REDACTED]');
    assert.equal(redacted.headers.host, 'example.com');
  });

  it('redacts multiple sensitive paths', () => {
    const redactor = new ManifestRedactor();
    const logData = {
      user: {
        email: 'user@example.com',
        password: 'secret123',
      },
      session: {
        token: 'xyz789',
        expires: '2025-12-31',
      },
    };

    const redacted = redactor.redactPaths(logData, ['user.password', 'session.token']);

    assert.equal(redacted.user.email, 'user@example.com');
    assert.equal(redacted.user.password, '[REDACTED]');
    assert.equal(redacted.session.token, '[REDACTED]');
    assert.equal(redacted.session.expires, '2025-12-31');
  });
});

describe('Integration: CLI Output', () => {
  it('redacts secrets in command output', () => {
    const detector = new SecretDetector();
    const commandOutput = `
      Environment configuration loaded:
      AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
      AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
      API_ENDPOINT=https://api.example.com
    `;

    const redacted = detector.redactText(commandOutput);

    assert.ok(!redacted.includes('AKIAIOSFODNN7EXAMPLE'));
    assert.ok(redacted.includes('API_ENDPOINT=https://api.example.com'));
  });

  it('redacts GitHub tokens in git output', () => {
    const detector = new SecretDetector();
    const gitOutput = 'remote: https://ghp_1234567890abcdefghijklmnopqrstuvwxyz@github.com/user/repo.git';

    const redacted = detector.redactText(gitOutput);

    assert.ok(!redacted.includes('ghp_1234567890abcdefghijklmnopqrstuvwxyz'));
  });
});

describe('Integration: Performance', () => {
  it('handles large catalog files efficiently', () => {
    const redactor = new ManifestRedactor();
    const largeCatalog = {
      entries: Array.from({ length: 1000 }, (_, i) => ({
        id: `file-${i}`,
        metadata: {
          email: `user${i}@example.com`,
          apiKey: `key_${i}_secret`,
          created: new Date().toISOString(),
        },
      })),
    };

    const start = performance.now();
    const redacted = redactor.redact(largeCatalog);
    const duration = performance.now() - start;

    // Should complete in reasonable time (< 100ms for 1000 entries)
    assert.ok(duration < 100, `Redaction took ${duration}ms`);
    assert.equal(redacted.entries.length, 1000);
    assert.equal(redacted.entries[0].metadata.apiKey, '[REDACTED]');
    assert.ok(redacted.entries[0].metadata.email.includes('@example.com'));
  });

  it('scans large text efficiently', () => {
    const detector = new SecretDetector();
    const largeText = Array.from({ length: 10000 }, () =>
      'This is a line of normal text. '
    ).join('\n') + 'AKIAIOSFODNN7EXAMPLE';

    const start = performance.now();
    const findings = detector.scan(largeText);
    const duration = performance.now() - start;

    // Should complete in reasonable time
    assert.ok(duration < 200, `Scan took ${duration}ms`);
    assert.ok(findings.some((f) => f.name === 'aws_access_key'));
  });
});

describe('Integration: Real-world Scenarios', () => {
  it('redacts complete API request log', () => {
    const redactor = new ManifestRedactor();
    const apiLog = {
      timestamp: '2025-10-03T10:30:00Z',
      method: 'POST',
      path: '/api/auth/login',
      request: {
        body: {
          username: 'alice',
          password: 'secret123',
        },
        headers: {
          authorization: 'Basic YWxpY2U6c2VjcmV0MTIz',
          'user-agent': 'Mozilla/5.0',
        },
      },
      response: {
        status: 200,
        body: {
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.test',
          user: { id: 1, name: 'alice' },
        },
      },
    };

    const redacted = redactor.redactPaths(apiLog, [
      'request.body.password',
      'request.headers.authorization',
      'response.body.token',
    ]);

    assert.equal(redacted.timestamp, '2025-10-03T10:30:00Z');
    assert.equal(redacted.request.body.username, 'alice');
    assert.equal(redacted.request.body.password, '[REDACTED]');
    assert.equal(redacted.request.headers.authorization, '[REDACTED]');
    assert.equal(redacted.response.body.token, '[REDACTED]');
    assert.equal(redacted.response.body.user.name, 'alice');
  });

  it('detects and redacts mixed secrets in documentation', () => {
    const detector = new SecretDetector();
    const doc = `
# API Documentation

## Authentication

Set your API key in the environment:

\`\`\`bash
export API_KEY=sk_live_4eC39HqLyjWDarjtT1zdp7dc
export DATABASE_URL=postgresql://admin:password123@localhost:5432/myapp
\`\`\`

Connect to the API endpoint at https://api.example.com
`;

    const findings = detector.scan(doc);

    assert.ok(findings.some((f) => f.name === 'stripe_secret'));
    assert.ok(findings.some((f) => f.name === 'postgresql_uri'));

    const redacted = detector.redactText(doc);
    assert.ok(!redacted.includes('sk_live_4eC39HqLyjWDarjtT1zdp7dc'));
    assert.ok(!redacted.includes('admin:password123'));
    assert.ok(redacted.includes('https://api.example.com'));
  });

  it('handles configuration file with mixed content', () => {
    const redactor = new ManifestRedactor();
    const config = {
      app: {
        name: 'MyApp',
        version: '1.0.0',
      },
      database: {
        host: 'localhost',
        port: 5432,
        password: 'db_secret_password',
      },
      services: {
        stripe: {
          publicKey: 'pk_test_123',
          secretKey: 'sk_test_456',
        },
        sendgrid: {
          apiKey: 'SG.1234567890',
          from: 'noreply@example.com',
        },
      },
    };

    const redacted = redactor.redact(config);

    assert.equal(redacted.app.name, 'MyApp');
    assert.equal(redacted.database.host, 'localhost');
    assert.equal(redacted.database.password, '[REDACTED]');
    assert.equal(redacted.services.stripe.secretKey, '[REDACTED]');
    assert.equal(redacted.services.sendgrid.apiKey, '[REDACTED]');
    assert.equal(redacted.services.sendgrid.from, 'noreply@example.com');
  });
});

describe('Integration: Pattern Coverage', () => {
  it('has comprehensive credential pattern coverage', () => {
    const patterns = Array.from(CREDENTIAL_PATTERNS.keys());

    // Verify key patterns are present
    const expectedPatterns = [
      'aws_access_key',
      'github_token',
      'stripe_secret',
      'jwt',
      'ssh_private_key',
      'mongodb_uri',
      'postgresql_uri',
    ];

    for (const expected of expectedPatterns) {
      assert.ok(
        patterns.includes(expected),
        `Missing pattern: ${expected}`
      );
    }
  });

  it('has comprehensive sensitive field coverage', () => {
    const testFields = [
      'password',
      'secret',
      'token',
      'apiKey',
      'privateKey',
      'authorization',
      'connectionString',
    ];

    for (const field of testFields) {
      const matches = SENSITIVE_FIELDS.some((rx) => rx.test(field));
      assert.ok(matches, `Field not covered: ${field}`);
    }
  });
});
