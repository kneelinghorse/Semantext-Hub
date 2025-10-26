import { describe, expect, jest, test } from '@jest/globals';

import { upsertManifest } from '../../packages/runtime/registry/repository.mjs';

function createDbMock() {
  return {
    run: jest.fn(async () => {}),
  };
}

function capabilityInsertParams(dbMock) {
  return dbMock.run.mock.calls
    .filter(([sql]) => sql.includes('INSERT OR IGNORE INTO capabilities'))
    .map(([, params]) => params);
}

describe('registry repository capability extraction', () => {
  test('extracts deduplicated capability strings from arrays', async () => {
    const db = createDbMock();
    await upsertManifest(
      db,
      'urn:demo:array',
      {
        id: 'demo',
        capabilities: [
          'urn:cap:a',
          { capability: '  urn:cap:b  ' },
          { urn: 'urn:cap:c' },
          'urn:cap:a',
          null,
        ],
      },
    );

    const inserts = capabilityInsertParams(db);
    expect(inserts).toHaveLength(3);
    const insertedCaps = inserts.map(([, cap]) => cap);
    expect(insertedCaps).toEqual(
      expect.arrayContaining(['urn:cap:a', 'urn:cap:b', 'urn:cap:c']),
    );
  });

  test('walks capability maps across tools/resources', async () => {
    const db = createDbMock();
    await upsertManifest(
      db,
      'urn:demo:map',
      {
        capabilities: {
          tools: [
            { capability: 'urn:cap:tool' },
            { urn: 'urn:cap:tool-alt' },
          ],
          resources: [
            'urn:cap:resource',
            { capability: '  urn:cap:resource ' },
          ],
        },
      },
    );

    const insertedCaps = capabilityInsertParams(db).map(([, cap]) => cap);
    expect(insertedCaps).toEqual(
      expect.arrayContaining([
        'urn:cap:tool',
        'urn:cap:tool-alt',
        'urn:cap:resource',
      ]),
    );
  });

  test('unwraps manifest payloads provided as JSON strings', async () => {
    const db = createDbMock();
    const wrapper = JSON.stringify({
      manifest: {
        capabilities: ['urn:cap:wrapped'],
      },
    });

    const result = await upsertManifest(db, 'urn:demo:wrapper', wrapper);

    expect(result.urn).toBe('urn:demo:wrapper');
    const insertedCaps = capabilityInsertParams(db).map(([, cap]) => cap);
    expect(insertedCaps).toEqual(['urn:cap:wrapped']);
  });
});
