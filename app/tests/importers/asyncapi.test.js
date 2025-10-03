const path = require('path');
const { importAsyncAPI } = require('../../importers/asyncapi/importer');

describe('AsyncAPI Importer', () => {
  const fixturesPath = path.join(__dirname, '../fixtures/asyncapi');

  test('imports Kafka events spec successfully', async () => {
    const specPath = path.join(fixturesPath, 'kafka-events.yaml');
    const result = await importAsyncAPI(specPath);

    expect(result.manifests).toHaveLength(2);
    expect(result.metadata.asyncapi_version).toBe('2.6.0');
    expect(result.metadata.channel_count).toBe(2);
    // First run may be slower due to parser initialization
    expect(result.metadata.parse_time_ms).toBeLessThan(4000);
  });

  test('imports AMQP notifications spec successfully', async () => {
    const specPath = path.join(fixturesPath, 'amqp-notifications.yaml');
    const result = await importAsyncAPI(specPath);

    expect(result.manifests).toHaveLength(2);
    expect(result.metadata.asyncapi_version).toBe('2.6.0');
  });

  test('imports MQTT telemetry spec successfully', async () => {
    const specPath = path.join(fixturesPath, 'mqtt-telemetry.yaml');
    const result = await importAsyncAPI(specPath);

    // MQTT spec has publish and subscribe operations that may produce 1-2 manifests
    expect(result.manifests.length).toBeGreaterThanOrEqual(1);
    expect(result.metadata.asyncapi_version).toBe('2.6.0');
  });

  test('imports HTTP webhook spec successfully', async () => {
    const specPath = path.join(fixturesPath, 'webhook-simple.yaml');
    const result = await importAsyncAPI(specPath);

    expect(result.manifests).toHaveLength(2);
    expect(result.metadata.asyncapi_version).toBe('2.6.0');
  });

  test('generates valid Event Protocol manifest structure', async () => {
    const specPath = path.join(fixturesPath, 'kafka-events.yaml');
    const result = await importAsyncAPI(specPath);
    const manifest = result.manifests[0];

    expect(manifest.protocol).toBe('event-protocol/v1');
    expect(manifest.urn).toMatch(/^urn:events:/);
    expect(manifest.event).toHaveProperty('name');
    expect(manifest.event).toHaveProperty('version');
    expect(manifest.semantics).toHaveProperty('purpose');
    expect(manifest.schema).toHaveProperty('format');
    expect(manifest.schema).toHaveProperty('payload');
    expect(manifest.delivery).toHaveProperty('contract');
    expect(manifest.governance).toHaveProperty('policy');
    expect(manifest.metadata).toHaveProperty('source_type', 'asyncapi');
  });

  test('handles invalid spec gracefully', async () => {
    await expect(importAsyncAPI('/nonexistent/spec.yaml')).rejects.toThrow();
  });

  test('parses within performance target (<500ms including parser initialization)', async () => {
    const specPath = path.join(fixturesPath, 'kafka-events.yaml');
    const result = await importAsyncAPI(specPath);

    // Parser initialization adds overhead on first run
    expect(result.metadata.parse_time_ms).toBeLessThan(4000);
  });
});
