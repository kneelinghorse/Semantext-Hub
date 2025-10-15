#!/usr/bin/env node

import Table from 'cli-table3';
import chalk from 'chalk';

import { createConsole } from '../../src/cli/ux/console.js';
import {
  CatalogCliError,
  filterPrimaryNodes,
  loadCatalogGraph
} from './catalog-shared.js';

function truncate(value, max = 80) {
  if (!value) return '—';
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export async function catalogListCommand(options = {}) {
  const consoleUi = createConsole();
  const format = (options.format ?? 'table').toLowerCase();
  const spinner = format === 'json' ? null : consoleUi.spinner('Discovering catalog manifests...');
  if (spinner) {
    spinner.start();
  }

  try {
    const { workspace, graph } = await loadCatalogGraph({
      workspace: options.workspace
    });

    const nodes = filterPrimaryNodes(graph).sort((a, b) =>
      a.label.localeCompare(b.label, 'en', { sensitivity: 'base' })
    );

    const summaries = nodes.map((node) => ({
      name: node.label,
      version: node.metadata?.version ?? '—',
      description: node.metadata?.description ?? '',
      urn: node.urn,
      path: node.path
    }));

    if (spinner) {
      spinner.stop();
    }

    if (format === 'json') {
      console.log(
        JSON.stringify(
          summaries.map((entry) => ({
            name: entry.name,
            version: entry.version,
            description: entry.description,
            urn: entry.urn,
            path: entry.path
          })),
          null,
          2
        )
      );
      return {
        workspace,
        protocols: summaries
      };
    }

    if (summaries.length === 0) {
      consoleUi.warn('No protocols found in catalog.', [
        `Workspace: ${workspace}`,
        'Add catalog manifests under artifacts/catalogs or use --workspace.'
      ]);
      return {
        workspace,
        protocols: []
      };
    }

    const table = new Table({
      head: [
        chalk.cyan('Protocol Name'),
        chalk.cyan('Version'),
        chalk.cyan('Description')
      ],
      wordWrap: true,
      colWidths: [32, 12, 80]
    });

    for (const entry of summaries) {
      table.push([
        entry.name,
        entry.version,
        truncate(entry.description, 78)
      ]);
    }

    consoleUi.success(`Found ${summaries.length} protocol${summaries.length === 1 ? '' : 's'}.`, [
      `Workspace: ${workspace}`
    ]);
    console.log();
    console.log(table.toString());

    return {
      workspace,
      protocols: summaries
    };
  } catch (error) {
    if (spinner) {
      spinner.stop();
    }
    throw new CatalogCliError('Unable to list catalog protocols.', {
      details: [error.message ?? String(error)],
      cause: error
    });
  }
}

export default {
  catalogListCommand
};
