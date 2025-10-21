#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import fs from 'fs-extra';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '../..');

const DEFAULT_OUT = path.join(APP_ROOT, 'artifacts', 'wsap', 'v2');

const SEEDS = [
  {
    name: 'asyncapi-streetlights',
    type: 'asyncapi',
    urls: [
      'https://raw.githubusercontent.com/asyncapi/spec/v2.6.0/examples/2.6.0/streetlights.yml',
      'https://raw.githubusercontent.com/asyncapi/spec/v2.5.0/examples/2.5.0/streetlights.yml',
      'https://raw.githubusercontent.com/asyncapi/spec/master/examples/2.5.0/streetlights.yml',
      'https://raw.githubusercontent.com/asyncapi/spec/master/examples/2.6.0/streetlights.yml',
    ],
    fallback: `asyncapi: '2.6.0'\ninfo:\n  title: Streetlights\n  version: '1.0.0'\nchannels:\n  light/turn/on:\n    publish:\n      message:\n        name: turnOn\n        payload:\n          type: object\n          properties:\n            id:\n              type: string\n`,
    filename: 'streetlights.asyncapi.yml',
  },
  {
    name: 'pagila-ddl',
    type: 'ddl',
    url: 'https://raw.githubusercontent.com/devrimgunduz/pagila/master/pagila-schema.sql',
    filename: 'pagila.schema.sql',
  },
];

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function main() {
  const outRoot = process.env.WSAP_V2_OUT || process.argv[2] || DEFAULT_OUT;
  const seedsDir = path.join(outRoot, 'seeds');
  await fs.ensureDir(seedsDir);

  const versions = [];
  for (const seed of SEEDS) {
    let buf;
    let sourceUrl = seed.url || null;
    if (seed.urls && Array.isArray(seed.urls)) {
      // Try candidate URLs until one succeeds
      for (const candidate of seed.urls) {
        // eslint-disable-next-line no-console
        console.log(`Attempting ${seed.name} from ${candidate}`);
        try {
          // eslint-disable-next-line no-await-in-loop
          const res = await fetch(candidate, { redirect: 'follow' });
          if (res.ok) {
            // eslint-disable-next-line no-await-in-loop
            buf = Buffer.from(await res.arrayBuffer());
            sourceUrl = candidate;
            break;
          }
        } catch {}
      }
      if (!buf && seed.fallback) {
        // eslint-disable-next-line no-console
        console.warn(`WARN: Falling back to embedded sample for ${seed.name}`);
        buf = Buffer.from(seed.fallback, 'utf8');
      }
    } else if (seed.url) {
      // eslint-disable-next-line no-console
      console.log(`Fetching ${seed.name} from ${seed.url}`);
      const res = await fetch(seed.url, { redirect: 'follow' });
      if (!res.ok) {
        throw new Error(`Failed to fetch ${seed.url}: ${res.status} ${res.statusText}`);
      }
      buf = Buffer.from(await res.arrayBuffer());
    }
    if (!buf) {
      throw new Error(`Unable to retrieve seed: ${seed.name}`);
    }
    const digest = sha256(buf);
    const saveAs = path.join(seedsDir, seed.filename);
    await fs.writeFile(saveAs, buf);
    versions.push({
      name: seed.name,
      type: seed.type,
      source_url: sourceUrl,
      sha256: digest,
      saved_as: path.relative(outRoot, saveAs).split(path.sep).join('/'),
      fetched_at: new Date().toISOString(),
    });
  }

  await fs.writeJson(path.join(outRoot, 'versions.json'), { version: 2, seeds: versions }, { spaces: 2 });
  // eslint-disable-next-line no-console
  console.log(`Saved ${versions.length} seeds under ${outRoot}`);
}

if (import.meta.url === `file://${fileURLToPath(import.meta.url)}`) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err.message);
    process.exitCode = 1;
  });
}

export default {
  main,
};
