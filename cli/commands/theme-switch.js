#!/usr/bin/env node

import path from 'path';

import { createConsole } from '../../src/cli/ux/console.js';
import { createThemeService } from '../../src/visualization/theme/serializer.js';
import { writeCytoscape } from '../../src/visualization/cytoscape/exporter.js';
import {
  CatalogCliError,
  loadCatalogGraph,
  ensureDirectory,
  timestampedFilename
} from './catalog-shared.js';
import { generateDiagram } from './catalog-generate-diagram.js';

function resolveWorkspace(workspace) {
  return workspace ? path.resolve(workspace) : process.cwd();
}

function formatThemeList(themes) {
  if (!themes.length) {
    return ['No themes found under /config/themes.'];
  }
  return themes.map((theme) => `- ${theme.id}${theme.name ? ` (${theme.name})` : ''}`);
}

export async function themeSwitchCommand(themeId, options = {}) {
  if (!themeId || typeof themeId !== 'string') {
    throw new CatalogCliError('Theme identifier is required.');
  }

  const workspace = resolveWorkspace(options.workspace);
  const consoleUi = createConsole();
  const spinner = consoleUi.spinner(`Applying theme "${themeId}"...`);
  spinner.start();

  try {
    const themeService = createThemeService({ root: workspace });
    const themes = themeService.listThemes();
    const targetTheme = themes.find((entry) => entry.id === themeId);

    if (!targetTheme) {
      spinner.fail('Theme not found.');
      throw new CatalogCliError(`Theme "${themeId}" is not available.`, {
        details: ['Available themes:', ...formatThemeList(themes)]
      });
    }

    themeService.setActiveThemeId(themeId);

    const { graph } = await loadCatalogGraph({ workspace });
    if (!graph?.nodes?.length) {
      spinner.fail('No catalog graph available.');
      throw new CatalogCliError('Canonical catalog graph is empty.', {
        details: ['Generate catalog artifacts before switching themes.']
      });
    }

    const drawioResult = await generateDiagram({
      workspace,
      graph,
      overwrite: true,
      silent: true,
      prefix: `catalog-${themeId}`,
      themeId
    });

    const cytoscapeDir = path.join(workspace, 'artifacts', 'visualizations', 'cytoscape');
    await ensureDirectory(cytoscapeDir);
    const cytoscapePath = path.join(cytoscapeDir, timestampedFilename(`catalog-${themeId}`, '.json'));
    const cytoscapeResult = await writeCytoscape(graph, cytoscapePath, {
      overwrite: true,
      includeMetadata: options.includeMetadata !== false,
      themeId
    });

    spinner.stop();

    consoleUi.success('Theme applied.', [
      `Active theme: ${targetTheme.name ?? targetTheme.id}`,
      `Draw.io export: ${drawioResult.outputPath}`,
      `Cytoscape export: ${cytoscapeResult.outputPath}`
    ]);

    if (drawioResult.warnings.length > 0) {
      consoleUi.warn('Draw.io warnings', drawioResult.warnings);
    }

    if (Array.isArray(cytoscapeResult.warnings) && cytoscapeResult.warnings.length > 0) {
      consoleUi.warn('Cytoscape warnings', cytoscapeResult.warnings);
    }

    return {
      theme: targetTheme.id,
      drawio: drawioResult.outputPath,
      cytoscape: cytoscapeResult.outputPath
    };
  } catch (error) {
    if (spinner.isSpinning?.()) {
      spinner.fail('Failed to apply theme.');
    }
    throw error;
  }
}

export default {
  themeSwitchCommand
};
