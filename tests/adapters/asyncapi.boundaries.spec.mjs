/**
 * @file AsyncAPI Adapter Boundary Tests
 * @description Comprehensive tests for AsyncAPI adapter covering happy paths and unsupported features
 * Mission: B18.14-20251020
 */

import { afterEach, beforeEach, describe, test, expect } from '@jest/globals';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let tempDir;
let buildAdapter;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'adapter-asyncapi-boundary-'));
  const moduleUrl = pathToFileURL(
    join(__dirname, '..', '..', 'app', 'adapters', 'asyncapi', 'src', 'index.mjs'),
  ).href;
  const module = await import(moduleUrl);
  buildAdapter = module.buildAdapter;
});

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe('AsyncAPI Adapter - Happy Path', () => {
  test('1. builds catalog with valid AsyncAPI spec', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'asyncapi',
      'fixtures',
      'minimal.json',
    );
    const result = await buildAdapter({ specPath, outDir: tempDir });
    
    expect(result.outDir).toBe(tempDir);
    expect(result.catalogPath).toContain('catalog.json');
    expect(result.details.adapter.name).toBe('asyncapi');
  });

  test('2. correctly identifies adapter type as event', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'asyncapi',
      'fixtures',
      'minimal.json',
    );
    const result = await buildAdapter({ specPath, outDir: tempDir });
    
    expect(result.details.adapter.type).toBe('event');
  });

  test('3. counts channels correctly', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'asyncapi',
      'fixtures',
      'minimal.json',
    );
    const result = await buildAdapter({ specPath, outDir: tempDir });
    
    expect(result.details.summary.itemsCount).toBeGreaterThan(0);
    expect(Array.isArray(result.details.summary.channels)).toBe(true);
  });

  test('4. extracts channel publish/subscribe flags', async () => {
    const specPath = join(tempDir, 'pub-sub.json');
    const spec = {
      asyncapi: '2.6.0',
      info: { title: 'Test', version: '1.0.0' },
      channels: {
        'event/created': {
          publish: { message: { name: 'Created' } }
        },
        'event/updated': {
          subscribe: { message: { name: 'Updated' } }
        }
      }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.channels[0].publish).toBe(true);
    expect(result.details.summary.channels[1].subscribe).toBe(true);
  });

  test('5. handles custom capabilities', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'asyncapi',
      'fixtures',
      'minimal.json',
    );
    const customCaps = ['adapter.event.stream', 'adapter.event.replay'];
    const result = await buildAdapter({ 
      specPath, 
      outDir: tempDir,
      capabilities: customCaps
    });
    
    expect(result.details.capabilities).toEqual(customCaps);
  });
});

describe('AsyncAPI Adapter - Missing Required Parameters', () => {
  test('6. throws error when specPath is missing', async () => {
    await expect(
      buildAdapter({ outDir: tempDir })
    ).rejects.toThrow('specPath is required');
  });

  test('7. throws error when outDir is missing', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'asyncapi',
      'fixtures',
      'minimal.json',
    );
    await expect(
      buildAdapter({ specPath })
    ).rejects.toThrow('outDir is required');
  });

  test('8. throws error when specPath is undefined', async () => {
    await expect(
      buildAdapter({ specPath: undefined, outDir: tempDir })
    ).rejects.toThrow('specPath is required');
  });

  test('9. throws error when outDir is empty string', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'asyncapi',
      'fixtures',
      'minimal.json',
    );
    await expect(
      buildAdapter({ specPath, outDir: '' })
    ).rejects.toThrow('outDir is required');
  });
});

describe('AsyncAPI Adapter - Invalid File Paths', () => {
  test('10. throws error for non-existent file', async () => {
    const specPath = join(tempDir, 'does-not-exist.json');
    await expect(
      buildAdapter({ specPath, outDir: tempDir })
    ).rejects.toThrow('Spec file not found');
  });

  test('11. throws error for invalid path characters', async () => {
    const specPath = '/invalid/\0/path.json';
    await expect(
      buildAdapter({ specPath, outDir: tempDir })
    ).rejects.toThrow();
  });

  test('12. handles relative paths correctly', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'asyncapi',
      'fixtures',
      'minimal.json',
    );
    const result = await buildAdapter({ specPath, outDir: tempDir });
    
    expect(result.details.source.original).toBe(specPath);
  });
});

describe('AsyncAPI Adapter - Malformed Specs', () => {
  test('13. throws error for invalid JSON', async () => {
    const specPath = join(tempDir, 'invalid.json');
    await writeFile(specPath, '{ "asyncapi": "2.6.0", invalid', 'utf8');
    
    await expect(
      buildAdapter({ specPath, outDir: tempDir })
    ).rejects.toThrow('Unable to parse spec');
  });

  test('14. handles completely empty file gracefully', async () => {
    const specPath = join(tempDir, 'empty.json');
    await writeFile(specPath, '', 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.source.format).toBe('yaml');
    expect(result.details.summary.itemsCount).toBe(0);
    expect(result.details.summary.channels).toEqual([]);
  });

  test('15. handles spec without channels gracefully', async () => {
    const specPath = join(tempDir, 'no-channels.json');
    const spec = {
      asyncapi: '2.6.0',
      info: { title: 'Test', version: '1.0.0' }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(0);
  });

  test('16. handles spec without info gracefully', async () => {
    const specPath = join(tempDir, 'no-info.json');
    const spec = {
      asyncapi: '2.6.0',
      channels: {}
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.title).toBe('AsyncAPI Reference');
  });

  test('17. handles null channels object', async () => {
    const specPath = join(tempDir, 'null-channels.json');
    const spec = {
      asyncapi: '2.6.0',
      info: { title: 'Test', version: '1.0.0' },
      channels: null
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(0);
  });

  test('18. handles malformed channel definitions', async () => {
    const specPath = join(tempDir, 'malformed-channels.json');
    const spec = {
      asyncapi: '2.6.0',
      info: { title: 'Test', version: '1.0.0' },
      channels: {
        'valid/channel': { publish: {} },
        'invalid/channel': null,
        'another/invalid': 'string-not-object'
      }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(1);
  });
});

describe('AsyncAPI Adapter - YAML Support', () => {
  test('19. parses valid YAML AsyncAPI spec', async () => {
    const specPath = join(tempDir, 'spec.yaml');
    const yaml = `asyncapi: 2.6.0
info:
  title: Event System
  version: 1.0.0
channels:
  user/created:
    publish:
      message:
        name: UserCreated`;
    await writeFile(specPath, yaml, 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.source.format).toBe('yaml');
    expect(result.details.summary.itemsCount).toBe(1);
  });

  test('20. throws error for invalid YAML syntax', async () => {
    const specPath = join(tempDir, 'invalid.yml');
    await writeFile(specPath, 'asyncapi: [invalid\nyaml: syntax', 'utf8');
    
    await expect(
      buildAdapter({ specPath, outDir: tempDir })
    ).rejects.toThrow('Unable to parse spec');
  });
});

describe('AsyncAPI Adapter - Edge Cases', () => {
  test('21. handles empty channels object', async () => {
    const specPath = join(tempDir, 'empty-channels.json');
    const spec = {
      asyncapi: '2.6.0',
      info: { title: 'Test', version: '1.0.0' },
      channels: {}
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(0);
    expect(result.details.summary.channels).toEqual([]);
  });

  test('22. handles channels without descriptions', async () => {
    const specPath = join(tempDir, 'no-descriptions.json');
    const spec = {
      asyncapi: '2.6.0',
      info: { title: 'Test', version: '1.0.0' },
      channels: {
        'event/test': {
          publish: { message: { name: 'Test' } }
        }
      }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.channels[0].description).toBeNull();
  });

  test('23. handles channels with only description', async () => {
    const specPath = join(tempDir, 'description-only.json');
    const spec = {
      asyncapi: '2.6.0',
      info: { title: 'Test', version: '1.0.0' },
      channels: {
        'event/test': {
          description: 'Test channel'
        }
      }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.channels[0].publish).toBe(false);
    expect(result.details.summary.channels[0].subscribe).toBe(false);
  });

  test('24. handles channels with both publish and subscribe', async () => {
    const specPath = join(tempDir, 'bidirectional.json');
    const spec = {
      asyncapi: '2.6.0',
      info: { title: 'Test', version: '1.0.0' },
      channels: {
        'bidirectional/channel': {
          publish: { message: { name: 'Outgoing' } },
          subscribe: { message: { name: 'Incoming' } }
        }
      }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.channels[0].publish).toBe(true);
    expect(result.details.summary.channels[0].subscribe).toBe(true);
  });

  test('25. handles very large number of channels', async () => {
    const specPath = join(tempDir, 'many-channels.json');
    const spec = {
      asyncapi: '2.6.0',
      info: { title: 'Large Event System', version: '1.0.0' },
      channels: {}
    };
    
    // Generate 50 channels
    for (let i = 0; i < 50; i++) {
      spec.channels[`event/type${i}`] = {
        description: `Event type ${i}`,
        publish: { message: { name: `Event${i}` } }
      };
    }
    
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(50);
  });

  test('26. preserves channel names with special characters', async () => {
    const specPath = join(tempDir, 'special-chars.json');
    const spec = {
      asyncapi: '2.6.0',
      info: { title: 'Test', version: '1.0.0' },
      channels: {
        'events/user.created': { publish: {} },
        'events/order-placed': { publish: {} },
        'events/payment_received': { publish: {} }
      }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    const result = await buildAdapter({ specPath, outDir: tempDir });
    const channelNames = result.details.summary.channels.map(ch => ch.channel);
    expect(channelNames).toContain('events/user.created');
    expect(channelNames).toContain('events/order-placed');
    expect(channelNames).toContain('events/payment_received');
  });

  test('27. includes timestamp in generated catalog', async () => {
    const specPath = join(
      __dirname,
      '..',
      '..',
      'app',
      'adapters',
      'asyncapi',
      'fixtures',
      'minimal.json',
    );
    const result = await buildAdapter({ specPath, outDir: tempDir });
    
    expect(result.details.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const date = new Date(result.details.generated_at);
    expect(date.getTime()).toBeGreaterThan(0);
  });
});

describe('AsyncAPI Adapter - Unsupported Features', () => {
  test('28. UNSUPPORTED: AsyncAPI 1.x specs', async () => {
    const specPath = join(tempDir, 'asyncapi-v1.json');
    const spec = {
      asyncapi: '1.2.0',
      info: { title: 'Legacy AsyncAPI', version: '1.0.0' },
      topics: {
        'user.created': {
          publish: { $ref: '#/components/messages/UserCreated' }
        }
      }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    // v1 uses 'topics' instead of 'channels'
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(0);
  });

  test('29. UNSUPPORTED: Server bindings (protocol-specific)', async () => {
    const specPath = join(tempDir, 'server-bindings.json');
    const spec = {
      asyncapi: '2.6.0',
      info: { title: 'Test', version: '1.0.0' },
      servers: {
        production: {
          url: 'mqtt://broker.example.com',
          protocol: 'mqtt',
          bindings: {
            mqtt: {
              clientId: 'test-client',
              cleanSession: true
            }
          }
        }
      },
      channels: {
        'sensor/data': { publish: {} }
      }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    // Adapter counts channels but doesn't process server bindings
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(1);
    expect(result.details.summary).not.toHaveProperty('servers');
  });

  test('30. UNSUPPORTED: Message traits and operation traits', async () => {
    const specPath = join(tempDir, 'traits.json');
    const spec = {
      asyncapi: '2.6.0',
      info: { title: 'Test', version: '1.0.0' },
      channels: {
        'event/test': {
          publish: {
            operationId: 'publishTest',
            traits: [
              { $ref: '#/components/operationTraits/commonHeaders' }
            ],
            message: {
              traits: [
                { $ref: '#/components/messageTraits/commonHeaders' }
              ]
            }
          }
        }
      },
      components: {
        messageTraits: {
          commonHeaders: {
            headers: { type: 'object' }
          }
        }
      }
    };
    await writeFile(specPath, JSON.stringify(spec), 'utf8');
    
    // Adapter counts channel but doesn't resolve traits
    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.summary.itemsCount).toBe(1);
  });

  test('31. Remote spec fetch without global fetch support fails fast', async () => {
    const remoteUrl = 'https://example.com/asyncapi.yaml';
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    try {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: undefined,
      });

      await expect(
        buildAdapter({ specPath: remoteUrl, outDir: tempDir })
      ).rejects.toThrow('Global fetch API unavailable');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'fetch', originalDescriptor);
      } else {
        delete globalThis.fetch;
      }
    }
  });
});

describe('AsyncAPI Adapter - Parser Fallbacks', () => {
  test('32. falls back to YAML when JSON extension contains YAML content', async () => {
    const specPath = join(tempDir, 'yaml-in-json.json');
    const yaml = `asyncapi: 2.6.0
info:
  title: YAML AsyncAPI
  version: 1.0.0
channels:
  event/ping:
    publish:
      message:
        name: Ping`;
    await writeFile(specPath, yaml, 'utf8');

    const result = await buildAdapter({ specPath, outDir: tempDir });
    expect(result.details.source.format).toBe('yaml');
    expect(result.details.summary.itemsCount).toBe(1);
    expect(result.details.summary.channels[0].channel).toBe('event/ping');
  });
});
