import { afterEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { readFile } from 'node:fs/promises';

import {
  API_KEY,
  BASE_CARD,
  cleanupRegistryTestContexts,
  createRegistryTestContext,
} from './helpers/registry-context.mjs';

function cloneCard() {
  return JSON.parse(JSON.stringify(BASE_CARD));
}

async function registerAgent(app, { urn, card, signCard }) {
  const sig = signCard(card);
  await request(app)
    .post('/registry')
    .set('X-API-Key', API_KEY)
    .send({ urn, card, sig })
    .expect(201);
}

describe('Registry capability queries', () => {
  afterEach(async () => {
    await cleanupRegistryTestContexts();
  });

  it('returns verified agents sorted by exact then partial capability match', async () => {
    const { app, signCard, capIndexPath } = await createRegistryTestContext();

    const exactCard = cloneCard();
    exactCard.id = 'capability.exact';
    exactCard.name = 'Exact Capability Agent';
    exactCard.capabilities.tools = [
      {
        name: 'call_api',
        capability: 'protocol:api@1.1.1',
        urn: 'protocol:api@1.1.1',
      },
    ];

    const partialCard = cloneCard();
    partialCard.id = 'capability.partial';
    partialCard.name = 'Partial Capability Agent';
    partialCard.capabilities.tools = [
      {
        name: 'async_call',
        capability: 'protocol:api@1.1.1#async',
        urn: 'protocol:api@1.1.1#async',
      },
    ];

    const otherCard = cloneCard();
    otherCard.id = 'capability.other';
    otherCard.name = 'Other Capability Agent';
    otherCard.capabilities.tools = [
      {
        name: 'transform',
        capability: 'protocol:transform@2.0.0',
        urn: 'protocol:transform@2.0.0',
      },
    ];

    await registerAgent(app, {
      urn: 'urn:agent:capability:exact',
      card: exactCard,
      signCard,
    });
    await registerAgent(app, {
      urn: 'urn:agent:capability:partial',
      card: partialCard,
      signCard,
    });
    await registerAgent(app, {
      urn: 'urn:agent:capability:other',
      card: otherCard,
      signCard,
    });

    const capIndex = JSON.parse(await readFile(capIndexPath, 'utf8'));
    expect(Array.isArray(capIndex.entries)).toBe(true);
    expect(capIndex.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: 'protocol:api@1.1.1',
          urns: expect.arrayContaining(['urn:agent:capability:exact']),
        }),
      ]),
    );

    const response = await request(app)
      .get('/registry')
      .set('X-API-Key', API_KEY)
      .query({ cap: 'protocol:api@1.1.1' })
      .expect(200);

    expect(response.body.total).toBe(2);
    expect(response.body.results).toHaveLength(2);
    expect(response.body.results[0].urn).toBe('urn:agent:capability:exact');
    expect(response.body.results[0].verified).toBe(true);
    expect(response.body.results[0].matches[0]).toMatchObject({
      normalizedQuery: 'protocol:api@1.1.1',
      exact: true,
      capability: 'protocol:api@1.1.1',
    });
    expect(response.body.results[1].urn).toBe('urn:agent:capability:partial');
    expect(response.body.results[1].matches[0]).toMatchObject({
      normalizedQuery: 'protocol:api@1.1.1',
      exact: false,
      capability: 'protocol:api@1.1.1#async',
    });
  });

  it('requires all requested capabilities and supports pagination parameters', async () => {
    const { app, signCard } = await createRegistryTestContext();

    const base = cloneCard();
    base.id = 'capability.multi';
    base.name = 'Multi Capability Agent';
    base.capabilities.tools = [
      {
        name: 'call_api',
        capability: 'protocol:api@1.1.1',
        urn: 'protocol:api@1.1.1',
      },
      {
        name: 'stream',
        capability: 'protocol:api@1.1.1#stream',
        urn: 'protocol:api@1.1.1#stream',
      },
    ];

    const other = cloneCard();
    other.id = 'capability.partial-only';
    other.name = 'Partial Only Agent';
    other.capabilities.tools = [
      {
        name: 'stream',
        capability: 'protocol:api@1.1.1#stream',
        urn: 'protocol:api@1.1.1#stream',
      },
    ];

    await registerAgent(app, {
      urn: 'urn:agent:capability:multi',
      card: base,
      signCard,
    });
    await registerAgent(app, {
      urn: 'urn:agent:capability:partial-only',
      card: other,
      signCard,
    });

    const multi = await request(app)
      .get('/registry')
      .set('X-API-Key', API_KEY)
      .query({ cap: ['protocol:api@1.1.1', 'call_api'] })
      .expect(200);

    expect(multi.body.total).toBe(1);
    expect(multi.body.results).toHaveLength(1);
    expect(multi.body.results[0].urn).toBe('urn:agent:capability:multi');
    const matches = multi.body.results[0].matches.reduce(
      (acc, match) => ({ ...acc, [match.normalizedQuery]: match }),
      {},
    );
    expect(matches['protocol:api@1.1.1'].exact).toBe(true);
    expect(matches.call_api.exact).toBe(true);

    const list = await request(app)
      .get('/registry')
      .set('X-API-Key', API_KEY)
      .query({ cap: 'protocol:api@1.1.1', limit: 1 })
      .expect(200);

    expect(list.body.total).toBe(2);
    expect(list.body.results).toHaveLength(1);
    expect(list.body.query.limit).toBe(1);

    const offset = await request(app)
      .get('/registry')
      .set('X-API-Key', API_KEY)
      .query({ cap: 'protocol:api@1.1.1', offset: 1, limit: 1 })
      .expect(200);

    expect(offset.body.results).toHaveLength(1);
    expect(offset.body.query.offset).toBe(1);
  });

  it('rejects invalid capability parameters with a 400 error', async () => {
    const { app } = await createRegistryTestContext();

    const response = await request(app)
      .get('/registry')
      .set('X-API-Key', API_KEY)
      .query({ cap: 'not valid!!' })
      .expect(400);

    expect(response.body.error).toBe('invalid_query');
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'invalid_format' }),
      ]),
    );
  });
});
