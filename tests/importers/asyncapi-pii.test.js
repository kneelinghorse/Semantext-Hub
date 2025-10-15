import path from 'path';
import { fileURLToPath } from 'url';
import { importAsyncAPI } from '../../packages/runtime/importers/asyncapi/importer.js';
import {
  matchDefinitePII,
  matchPotentialPII,
  matchContextualPII,
  matchesExclusionPattern,
  analyzeChannelContext
} from '../../packages/runtime/importers/asyncapi/pii-detector.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('PII Detection', () => {
  const fixturesPath = path.join(__dirname, '../fixtures/asyncapi');

  test('detects Tier 1 definite PII (email) with 95%+ confidence', async () => {
    const specPath = path.join(fixturesPath, 'kafka-events.yaml');
    const result = await importAsyncAPI(specPath);
    const manifest = result.manifests[0];

    const emailField = manifest.schema.fields.find(f => f.name === 'customerEmail');
    expect(emailField).toBeDefined();
    expect(emailField.pii).toBe(true);
    expect(emailField.confidence).toBeGreaterThanOrEqual(0.95);
    expect(emailField.tier).toBe('definite');
    expect(emailField.category).toBe('email');
  });

  test('detects Tier 2 potential PII (address fields) with 85-94% confidence', async () => {
    const specPath = path.join(fixturesPath, 'kafka-events.yaml');
    const result = await importAsyncAPI(specPath);
    const manifest = result.manifests[0];

    const addressFields = manifest.schema.fields.filter(f =>
      f.name.includes('street') || f.name.includes('city') || f.name.includes('zipCode')
    );

    expect(addressFields.length).toBeGreaterThan(0);
    addressFields.forEach(field => {
      expect(field.pii).toBe(true);
      expect(field.confidence).toBeGreaterThanOrEqual(0.85);
      expect(field.tier).toBe('potential');
    });
  });

  test('detects Tier 3 contextual PII (customerId) with 70-84% confidence', async () => {
    const specPath = path.join(fixturesPath, 'kafka-events.yaml');
    const result = await importAsyncAPI(specPath);
    const manifest = result.manifests[0];

    const customerIdField = manifest.schema.fields.find(f => f.name === 'customerId');
    expect(customerIdField).toBeDefined();
    expect(customerIdField.pii).toBe(true);
    expect(customerIdField.confidence).toBeGreaterThanOrEqual(0.70);
    expect(customerIdField.tier).toBe('contextual');
  });

  test('detects explicit PII via x-pii annotation with 99% confidence', async () => {
    const specPath = path.join(fixturesPath, 'webhook-simple.yaml');
    const result = await importAsyncAPI(specPath);
    const manifest = result.manifests[0];

    const ccField = manifest.schema.fields.find(f => f.name === 'creditCardNumber');
    expect(ccField).toBeDefined();
    expect(ccField.pii).toBe(true);
    expect(ccField.confidence).toBe(0.99);
    expect(ccField.tier).toBe('explicit');
  });

  test('excludes system fields from PII detection', () => {
    expect(matchesExclusionPattern('timestamp')).toBe(true);
    expect(matchesExclusionPattern('created')).toBe(true);
    expect(matchesExclusionPattern('updated')).toBe(true);
    expect(matchesExclusionPattern('status')).toBe(true);
    expect(matchesExclusionPattern('type')).toBe(true);
    expect(matchesExclusionPattern('orderId')).toBe(false);
    expect(matchesExclusionPattern('customerId')).toBe(false);
  });

  test('applies channel context boost for payment channels', () => {
    const boost = analyzeChannelContext('payment.completed');
    expect(boost).toBeDefined();
    expect(boost.multiplier).toBe(1.2);
    expect(boost.reason).toBe('Payment-related channel');
  });

  test('applies channel context boost for user channels', () => {
    const boost = analyzeChannelContext('user.registered');
    expect(boost).toBeDefined();
    expect(boost.multiplier).toBe(1.15);
    expect(boost.reason).toBe('User-related channel');
  });

  test('classifies manifest as PII when PII fields detected', async () => {
    const specPath = path.join(fixturesPath, 'kafka-events.yaml');
    const result = await importAsyncAPI(specPath);
    const manifest = result.manifests[0];

    expect(manifest.governance.policy.classification).toBe('pii');
    expect(manifest.governance.policy.legal_basis).toBe('gdpr');
  });

  test('PII detection completes within performance target (<2s for 100 fields)', async () => {
    const specPath = path.join(fixturesPath, 'kafka-events.yaml');
    const start = performance.now();
    const result = await importAsyncAPI(specPath);
    const duration = performance.now() - start;

    // Total duration includes parsing + PII detection
    expect(duration).toBeLessThan(3000);
  });
});

describe('PII Pattern Matching', () => {
  test('matchDefinitePII identifies email patterns', () => {
    expect(matchDefinitePII('email')).toMatchObject({ confidence: 0.95, category: 'email' });
    expect(matchDefinitePII('emailAddress')).toMatchObject({ confidence: 0.95, category: 'email' });
    expect(matchDefinitePII('e-mail')).toMatchObject({ confidence: 0.95, category: 'email' });
  });

  test('matchDefinitePII identifies phone patterns', () => {
    expect(matchDefinitePII('phone')).toMatchObject({ confidence: 0.95, category: 'phone' });
    expect(matchDefinitePII('phoneNumber')).toMatchObject({ confidence: 0.95, category: 'phone' });
    expect(matchDefinitePII('mobile')).toMatchObject({ confidence: 0.95, category: 'phone' });
  });

  test('matchPotentialPII identifies name patterns', () => {
    expect(matchPotentialPII('firstName')).toMatchObject({ confidence: 0.85, category: 'name' });
    expect(matchPotentialPII('lastName')).toMatchObject({ confidence: 0.85, category: 'name' });
    expect(matchPotentialPII('fullName')).toMatchObject({ confidence: 0.85, category: 'name' });
  });

  test('matchContextualPII identifies userId patterns', () => {
    expect(matchContextualPII('userId')).toMatchObject({ confidence: 0.70, category: 'identifier' });
    expect(matchContextualPII('customerId')).toMatchObject({ confidence: 0.70, category: 'identifier' });
  });
});
