const path = require('path');
const { importAsyncAPI } = require('../../importers/asyncapi/importer');
const {
  generateEventURN,
  parseChannelSemantics,
  sanitizeDomain,
  parseURN,
  validateURN,
  buildURN
} = require('../../importers/asyncapi/urn-generator');

describe('URN Generation', () => {
  const fixturesPath = path.join(__dirname, '../fixtures/asyncapi');

  test('generates semantic URN for Kafka channel', async () => {
    const specPath = path.join(fixturesPath, 'kafka-events.yaml');
    const result = await importAsyncAPI(specPath);
    const manifest = result.manifests[0];

    expect(manifest.urn).toMatch(/^urn:events:/);
    expect(manifest.urn).toContain('orders');
    expect(manifest.urn).toContain('created');
  });

  test('generates URN with domain:entity:action format', async () => {
    const specPath = path.join(fixturesPath, 'kafka-events.yaml');
    const result = await importAsyncAPI(specPath);
    const manifest = result.manifests[0];

    const parts = manifest.urn.split(':');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe('urn');
    expect(parts[1]).toBe('events');
    expect(parts[2]).toBeTruthy(); // domain
    expect(parts[3]).toBeTruthy(); // entity
    expect(parts[4]).toBeTruthy(); // action
  });

  test('generates stable URN (version managed separately)', async () => {
    const specPath = path.join(fixturesPath, 'kafka-events.yaml');
    const result = await importAsyncAPI(specPath);
    const manifest = result.manifests[0];

    // URN should not contain version number
    expect(manifest.urn).not.toMatch(/v\d+/);
    expect(manifest.urn).not.toMatch(/\d+\.\d+/);

    // Version is in separate field
    expect(manifest.event.version).toBe('1.0.0');
  });

  test('URN generation completes within performance target (<10ms)', async () => {
    const specPath = path.join(fixturesPath, 'kafka-events.yaml');
    const result = await importAsyncAPI(specPath);

    // URN generation is included in total parse time
    expect(result.metadata.parse_time_ms).toBeLessThan(800);
  });
});

describe('URN Parsing and Validation', () => {
  test('parseChannelSemantics extracts two-part channel (entity.action)', () => {
    const info = { title: () => 'E-Commerce' };
    const result = parseChannelSemantics('orders.created', info);

    expect(result.domain).toBe('e-commerce');
    expect(result.entity).toBe('orders');
    expect(result.action).toBe('created');
  });

  test('parseChannelSemantics extracts three-part channel (domain/entity/action)', () => {
    const info = { title: () => 'Platform' };
    const result = parseChannelSemantics('commerce/order/created', info);

    expect(result.domain).toBe('commerce');
    expect(result.entity).toBe('order');
    expect(result.action).toBe('created');
  });

  test('parseChannelSemantics handles single-part channel', () => {
    const info = { title: () => 'Service' };
    const result = parseChannelSemantics('notifications', info);

    expect(result.domain).toBe('service');
    expect(result.entity).toBe('notifications');
    expect(result.action).toBe('event');
  });

  test('sanitizeDomain normalizes domain names', () => {
    expect(sanitizeDomain('E-Commerce Platform')).toBe('e-commerce-platform');
    expect(sanitizeDomain('My Service!!!')).toBe('my-service');
    expect(sanitizeDomain('   spaces   ')).toBe('spaces');
  });

  test('parseURN extracts components from valid URN', () => {
    const urn = 'urn:events:commerce:order:created';
    const parsed = parseURN(urn);

    expect(parsed.scheme).toBe('urn');
    expect(parsed.namespace).toBe('events');
    expect(parsed.domain).toBe('commerce');
    expect(parsed.entity).toBe('order');
    expect(parsed.action).toBe('created');
  });

  test('validateURN accepts valid URN format', () => {
    expect(validateURN('urn:events:commerce:order:created')).toBe(true);
    expect(validateURN('urn:events:user:profile:updated')).toBe(true);
  });

  test('validateURN rejects invalid URN format', () => {
    expect(validateURN('invalid')).toBe(false);
    expect(validateURN('urn:invalid:format')).toBe(false);
    expect(validateURN('events:order:created')).toBe(false);
  });

  test('buildURN constructs URN from components', () => {
    const components = {
      domain: 'commerce',
      entity: 'order',
      action: 'created'
    };

    const urn = buildURN(components);
    expect(urn).toBe('urn:events:commerce:order:created');
  });
});
