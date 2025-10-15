#!/usr/bin/env node

/**
 * Catalog diagram generation command.
 *
 * Provides CLI UX with spinner feedback, safe-by-default artifact management,
 * and optional auto-open behaviour for interactive workflows.
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

import { writeDrawio, DrawioExportError } from '../../src/visualization/drawio/exporter.js';
import { createConsole } from '../../src/cli/ux/console.js';
import { launch as launchWithGuardian } from '../../src/cli/utils/open-guardian.js';
import {
  CatalogCliError,
  createSubgraphForNode,
  findProtocolNode,
  loadCatalogGraph,
  timestampedFilename,
  ensureDirectory
} from './catalog-shared.js';

const DEFAULT_DIAGRAM_PREFIX = 'catalog';
const SUPPORTED_FORMATS = new Set(['drawio']);

function resolveWorkspace(workspace) {
  return workspace ? path.resolve(workspace) : process.cwd();
}

async function readGraphPayload(graphPath) {
  const payload = await fs.readFile(graphPath, 'utf-8');
  try {
    return JSON.parse(payload);
  } catch (error) {
    throw new DrawioExportError(`Failed to parse canonical graph JSON at ${graphPath}`, error);
  }
}

async function resolveOutputTarget(workspace, output, prefix) {
  if (!output) {
    const defaultDir = path.join(workspace, 'artifacts', 'diagrams');
    await ensureDirectory(defaultDir);
    return path.join(defaultDir, timestampedFilename(prefix));
  }

  const resolved = path.resolve(output);
  try {
    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      await ensureDirectory(resolved);
      return path.join(resolved, timestampedFilename(prefix));
    }
  } catch {
    // File or directory does not yet exist.
    if (!path.extname(resolved)) {
      await ensureDirectory(resolved);
      return path.join(resolved, timestampedFilename(prefix));
    }
  }

  await ensureDirectory(path.dirname(resolved));
  return resolved;
}

export async function generateDiagram(options = {}) {
  const workspace = resolveWorkspace(options.workspace);
  const graph =
    options.graph ??
    (await readGraphPayload(
      options.input ? path.resolve(options.input) : path.join(workspace, 'artifacts', 'catalog-graph.json')
    ));

  const outputPath = await resolveOutputTarget(workspace, options.output, options.prefix ?? DEFAULT_DIAGRAM_PREFIX);

  const result = await writeDrawio(graph, outputPath, {
    overwrite: Boolean(options.overwrite),
    layerBy: options.layerBy,
    splitBy: options.splitBy,
    themeId: options.themeId
  });

  if (!options.silent) {
    const consoleUi = createConsole();
    const lines = [
      `Output: ${result.outputPath}`,
      `Nodes: ${result.nodeCount}`,
      `Edges: ${result.edgeCount}`
    ];
    if (result.diagramCount > 1) {
      lines.push(`Pages: ${result.diagramCount}`);
    }
    consoleUi.success('Diagram generated.', lines);

    if (result.warnings.length > 0) {
      consoleUi.warn('Warnings', result.warnings);
    }

    if (result.guardrail?.tier && result.guardrail.tier !== 'optimal') {
      consoleUi.info('Mitigation tip', [
        'Use --layer-by <property> to toggle heavy domains.',
        'Use --split-by <property> to generate smaller pages.',
        'Filter the catalog or target a specific protocol to reduce scope.'
      ]);
    }
  }

  return result;
}

export async function catalogGenerateDiagramCommand(identifier, options = {}) {
  const workspace = resolveWorkspace(options.workspace);
  const consoleUi = createConsole();
  const label = identifier ? `protocol "${identifier}"` : 'catalog';
  const spinner = consoleUi.spinner(`Generating diagram for ${label}...`);
  spinner.start();

  try {
    const { graph } = await loadCatalogGraph({ workspace });

    let targetGraph = graph;
    let focusLabel = 'Full Catalog';

    if (identifier) {
      const node = findProtocolNode(graph, identifier);
      if (!node) {
        throw new CatalogCliError(`Protocol "${identifier}" not found.`, {
          details: [
            'Verify the name or URN.',
            'Run "app-cli catalog list" to inspect available entries.'
          ]
        });
      }
      targetGraph = createSubgraphForNode(graph, node);
      focusLabel = node.label;
    }

    const format = options.format ?? 'drawio';
    if (!SUPPORTED_FORMATS.has(format)) {
      throw new CatalogCliError(`Unsupported format "${format}".`, {
        details: [`Supported formats: ${Array.from(SUPPORTED_FORMATS).join(', ')}`]
      });
    }

    const result = await generateDiagram({
      workspace,
      graph: targetGraph,
      output: options.output,
      overwrite: options.overwrite,
      layerBy: options.layerBy,
      splitBy: options.splitBy,
      silent: true,
      prefix: options.prefix ?? DEFAULT_DIAGRAM_PREFIX,
      themeId: options.themeId
    });

    spinner.stop();

    const successDetails = [
      `Focus: ${focusLabel}`,
      `Diagram generated at: ${result.outputPath}`,
      `Nodes: ${result.nodeCount} · Edges: ${result.edgeCount}`
    ];
    if (result.diagramCount > 1) {
      successDetails.push(`Pages: ${result.diagramCount}`);
    }

    consoleUi.success('Success!', successDetails);

    if (result.warnings.length > 0) {
      consoleUi.warn('Guardrail notice', result.warnings);
    }

    if (result.guardrail?.tier && result.guardrail.tier !== 'optimal') {
      consoleUi.info('Mitigation tip', [
        'Use --layer-by <property> to toggle heavy domains.',
        'Use --split-by <property> to generate smaller pages.',
        'Filter or target a specific protocol before exporting.'
      ]);
    }

    if (options.open) {
      const openOutcome = await launchWithGuardian(result.outputPath, {
        type: 'file',
        interactive: consoleUi.interactive,
        env: process.env
      });

      if (openOutcome.skipped) {
        const reason = openOutcome.reason ?? 'Environment does not allow GUI operations.';
        consoleUi.warn('Skipping --open (guardian prevented launch).', [
          reason,
          'Open the file manually to inspect the diagram.'
        ]);
      } else if (!openOutcome.launched) {
        const details = [
          openOutcome.error?.message ?? 'Failed to launch system viewer.',
          openOutcome.command ? `Command: ${openOutcome.command} ${openOutcome.args?.join(' ') ?? ''}`.trim() : null,
          'Open the file manually to inspect the diagram.'
        ].filter(Boolean);
        consoleUi.warn('Unable to open diagram automatically.', details);
      } else {
        consoleUi.info('Opening diagram in default application...');
      }
    }

    return {
      ...result,
      focus: focusLabel
    };
  } catch (error) {
    spinner.stop();

    if (error instanceof CatalogCliError) {
      throw error;
    }

    if (error instanceof DrawioExportError) {
      throw new CatalogCliError('Diagram export failed.', {
        details: Array.isArray(error.details) && error.details.length > 0
          ? [error.message, ...error.details]
          : [error.message],
        cause: error
      });
    }

    throw new CatalogCliError('Failed to generate catalog diagram.', {
      details: [error.message ?? String(error)],
      cause: error
    });
  }
}

async function runFromCli() {
  const args = process.argv.slice(2);
  const options = {
    overwrite: false
  };
  let identifier = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--format':
      case '-f':
        options.format = args[++i];
        break;
      case '--overwrite':
        options.overwrite = true;
        break;
      case '--layer-by':
        options.layerBy = args[++i];
        break;
      case '--split-by':
        options.splitBy = args[++i];
        break;
      case '--theme':
        options.themeId = args[++i];
        break;
      case '--workspace':
      case '-w':
        options.workspace = args[++i];
        break;
      case '--input':
      case '-i':
        options.input = args[++i];
        break;
      case '--open':
        options.open = true;
        break;
      case '--silent':
        options.silent = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        return;
      default:
        if (!arg.startsWith('-') && !identifier) {
          identifier = arg;
        } else {
          console.warn(chalk.yellow(`Unknown option "${arg}"`));
          printHelp();
          return;
        }
    }
  }

  try {
    await catalogGenerateDiagramCommand(identifier, options);
  } catch (error) {
    const consoleUi = createConsole();
    if (error instanceof CatalogCliError) {
      consoleUi.error(error.message, error.details);
    } else {
      consoleUi.error('Unexpected error generating diagram.', [error.message ?? String(error)]);
    }
    process.exit(1);
  }
}

function printHelp() {
  const scriptPath = fileURLToPath(import.meta.url);
  const scriptName = path.basename(scriptPath);

  console.log(`
${chalk.bold('Draw.io Catalog Diagram Generator')}

${chalk.white('Usage:')} node ${scriptName} [protocol-name] [options]

Generates a Draw.io diagram for the entire catalog or a specific protocol entry.

${chalk.white('Arguments:')}
  protocol-name           Optional protocol name or URN to focus the diagram.

${chalk.white('Options:')}
  -o, --output <path>     Output file or directory. Defaults to /app/artifacts/diagrams/.
  -f, --format <format>   Diagram format (default: drawio).
      --overwrite         Allow overwriting an existing file.
      --layer-by <field>  Group nodes into Draw.io layers by a property (e.g., domain).
      --split-by <field>  Generate multi-page diagrams grouped by a property.
      --theme <name>      Apply a registered visualization theme before exporting.
      --open              Open the generated file using the default application (interactive only).
  -w, --workspace <path>  Workspace root containing catalog manifests (default: cwd).
  -i, --input <path>      Canonical graph JSON payload (bypass catalog build).
      --silent            Suppress console logs (useful for tests).
  -h, --help              Display this help message.
`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFromCli();
}

export default {
  generateDiagram,
  catalogGenerateDiagramCommand
};
