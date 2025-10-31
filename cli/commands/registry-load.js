#!/usr/bin/env node

import path from 'node:path';

import { createConsole } from '../../src/cli/ux/console.js';
import { CatalogCliError } from './catalog-shared.js';

function formatSummary(stats) {
  const lines = [];
  lines.push(`Manifests processed: ${stats.manifestsProcessed}`);
  lines.push(`Embeddings generated: ${stats.embeddingsGenerated}`);
  lines.push(`SQLite path: ${stats.dbPath}`);
  lines.push(
    `Vector store: ${stats.lancedbPath}${stats.vectorMode ? ` (${stats.vectorMode})` : ''}`
  );
  if (stats.dryRun) {
    lines.push('Dry run: no changes written to disk.');
  }
  if (Array.isArray(stats.manifestSummaries) && stats.manifestSummaries.length > 0) {
    const sample = stats.manifestSummaries.slice(0, 3);
    lines.push(
      'Sample manifests:',
      ...sample.map((entry) => `  • ${entry.urn} (${entry.source})`)
    );
    if (stats.manifestSummaries.length > sample.length) {
      const remaining = stats.manifestSummaries.length - sample.length;
      lines.push(`  • …and ${remaining} more`);
    }
  }
  return lines;
}

export async function registryLoadCommand(options = {}) {
  const consoleUi = createConsole();
  const outputJson = Boolean(options.json);
  const spinner = outputJson
    ? null
    : consoleUi.spinner('Loading semantic protocols into the registry...');

  if (spinner) {
    spinner.start();
  }

  try {
    const { RegistryLoader } = await import('../../packages/runtime/registry-loader/index.mjs');
    const loader = new RegistryLoader({
      workspace: options.workspace ?? process.cwd(),
      directory: options.directory,
      dbPath: options.db,
      lancedbPath: options.lancedb,
      collectionName: options.collection,
      batchSize: options.batchSize ? Number(options.batchSize) : undefined,
      dryRun: Boolean(options.dryRun),
      logger: consoleUi
    });

    const stats = await loader.load();

    if (spinner) {
      spinner.succeed('Registry load completed.');
    }

    if (outputJson) {
      console.log(
        JSON.stringify(
          {
            ...stats,
            dbPath: path.resolve(stats.dbPath),
            lancedbPath: path.resolve(stats.lancedbPath)
          },
          null,
          2
        )
      );
    } else {
      consoleUi.success('Registry loader summary:', formatSummary(stats));
    }

    return stats;
  } catch (error) {
    if (spinner) {
      spinner.fail('Registry load failed.');
    }
    throw new CatalogCliError('Unable to load registry manifests.', {
      cause: error,
      details: [error.message ?? String(error)]
    });
  }
}

export default {
  registryLoadCommand
};
