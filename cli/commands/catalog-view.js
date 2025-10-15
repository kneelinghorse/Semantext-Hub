#!/usr/bin/env node

import path from 'path';
import chalk from 'chalk';

import { createConsole } from '../../src/cli/ux/console.js';
import {
  CatalogCliError,
  findProtocolNode,
  loadCatalogGraph,
  loadManifestForNode
} from './catalog-shared.js';

function renderKeyValueRows(pairs) {
  const maxLabel = Math.max(...pairs.map(([label]) => label.length));
  return pairs
    .map(([label, value]) => {
      const padded = label.padEnd(maxLabel, ' ');
      return `${chalk.white.bold(padded)} : ${value ?? '—'}`;
    })
    .join('\n');
}

function renderList(label, values) {
  if (!values || values.length === 0) return null;
  const body = values.map((value) => `  • ${value}`).join('\n');
  return `${chalk.white.bold(label)}\n${body}`;
}

function normaliseArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

export async function catalogViewCommand(identifier, options = {}) {
  if (!identifier || typeof identifier !== 'string') {
    throw new CatalogCliError('Protocol identifier is required for catalog view.');
  }

  const consoleUi = createConsole();
  const format = (options.format ?? 'pretty').toLowerCase();
  const spinner = format === 'json' ? null : consoleUi.spinner(`Loading protocol "${identifier}"...`);
  if (spinner) {
    spinner.start();
  }

  try {
    const { workspace, graph } = await loadCatalogGraph({
      workspace: options.workspace
    });

    const node = findProtocolNode(graph, identifier);
    if (!node) {
      if (spinner) {
        spinner.stop();
      }
      throw new CatalogCliError(`Protocol "${identifier}" not found.`, {
        details: [
          'Check the protocol name or URN.',
          'Run "app-cli catalog list" to see available entries.'
        ]
      });
    }

    const manifest = await loadManifestForNode(workspace, node);

    if (spinner) {
      spinner.stop();
    }

    if (format === 'json') {
      console.log(
        JSON.stringify(
          {
            name: node.label,
            urn: node.urn,
            type: node.type,
            domain: node.domain,
            metadata: node.metadata,
            path: path.resolve(workspace, node.path),
            manifest
          },
          null,
          2
        )
      );

      return {
        workspace,
        protocol: node,
        manifest
      };
    }

    const absolutePath = path.resolve(workspace, node.path);
    const lines = [
      ['Name', node.label],
      ['URN', node.urn],
      ['Version', node.metadata?.version ?? '—'],
      ['Type', node.type],
      ['Domain', node.domain ?? '—'],
      ['Status', node.metadata?.status ?? '—'],
      ['Visibility', node.metadata?.visibility ?? '—'],
      ['Owner', node.metadata?.owner ?? '—'],
      ['Source', absolutePath]
    ];

    consoleUi.success(`Catalog entry: ${node.label}`, [
      `URN: ${node.urn}`,
      `Source: ${absolutePath}`
    ]);
    console.log();
    console.log(renderKeyValueRows(lines));

    const tags = normaliseArray(node.metadata?.tags);
    if (tags.length > 0) {
      console.log();
      console.log(renderList('Tags', tags));
    }

    const relationships = manifest.relationships ?? {};
    const relationshipKeys = Object.keys(relationships);
    if (relationshipKeys.length > 0) {
      console.log();
      console.log(chalk.white.bold('Relationships'));
      for (const key of relationshipKeys) {
        const values = normaliseArray(relationships[key]);
        if (values.length === 0) continue;
        values.forEach((value) => {
          const urn = typeof value === 'string' ? value : value?.urn;
          console.log(`  • ${key}: ${urn ?? '<unknown>'}`);
        });
      }
    }

    if (manifest.catalog) {
      console.log();
      console.log(chalk.white.bold('Catalog Fields'));
      console.log(
        chalk.gray(
          Object.keys(manifest.catalog)
            .map((field) => `  • ${field}`)
            .join('\n')
        )
      );
    }

    return {
      workspace,
      protocol: node,
      manifest
    };
  } catch (error) {
    if (spinner) {
      spinner.stop();
    }
    if (error instanceof CatalogCliError) {
      throw error;
    }
    throw new CatalogCliError('Unable to view catalog entry.', {
      details: [error.message ?? String(error)],
      cause: error
    });
  }
}

export default {
  catalogViewCommand
};
