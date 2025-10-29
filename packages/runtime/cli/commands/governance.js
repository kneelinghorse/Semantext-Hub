/**
 * Governance Command
 *
 * Generates GOVERNANCE.md using the GovernanceGenerator.
 */

import path from 'path';
import fs from 'fs-extra';
import { ProtocolGraph } from '../../../protocols/core/graph/protocol-graph.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import {
  loadManifestsFromDirectory,
  buildGraph
} from '../../workflow/graph-builder.js';
import {
  printInfo,
  printSuccess,
  printWarning,
  printError
} from '../utils/output.js';

function createLoggerAdapter(logger) {
  if (logger) {
    const target =
      typeof logger.child === 'function' ? logger.child('governance') : logger;

    const invoke = (level, message, context) => {
      if (typeof target[level] === 'function') {
        target[level](message, context);
      } else if (typeof target.log === 'function') {
        target.log(level, message, context);
      }
    };

    return {
      info: (message, context) => invoke('info', message, context),
      warn: (message, context) => invoke('warn', message, context),
      error: (message, context) => invoke('error', message, context),
      success: (message, context) =>
        invoke('info', message, { ...(context || {}), outcome: 'success' })
    };
  }

  return {
    info: message => printInfo(message),
    warn: message => printWarning(message),
    error: message => printError(message),
    success: message => printSuccess(message)
  };
}

function resolveSections(sectionOption) {
  if (!sectionOption) {
    return ['all'];
  }

  if (Array.isArray(sectionOption)) {
    return sectionOption.length ? sectionOption : ['all'];
  }

  if (typeof sectionOption === 'string') {
    return sectionOption
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
  }

  return ['all'];
}

async function loadWorkspaceGraph(manifestDir, log) {
  if (!manifestDir) {
    return {
      graph: new ProtocolGraph(),
      manifests: []
    };
  }

  const exists = await fs.pathExists(manifestDir);
  if (!exists) {
    log.warn(`Manifest directory not found: ${manifestDir}`);
    return {
      graph: new ProtocolGraph(),
      manifests: []
    };
  }

  const entries = await loadManifestsFromDirectory(manifestDir);
  const validManifests = entries.filter(entry => entry.manifest);

  if (validManifests.length === 0) {
    log.warn(`No manifest files with URNs detected in ${manifestDir}`);
    return {
      graph: new ProtocolGraph(),
      manifests: []
    };
  }

  log.info(`Loaded ${validManifests.length} manifest(s) from ${manifestDir}`);

  const { graph, stats } = buildGraph(validManifests);

  if (stats.duplicateURNs.length > 0) {
    log.warn(`Duplicate URNs detected: ${stats.duplicateURNs.join(', ')}`);
  }
  if (stats.unresolvedEdges.length > 0) {
    log.warn(`Unresolved dependencies: ${stats.unresolvedEdges.length}`);
  }

  return {
    graph,
    manifests: validManifests.map(entry => entry.manifest)
  };
}

async function governanceCommand(options = {}) {
  const log = createLoggerAdapter(options.logger);
  const usingConsole = !options.logger;

  try {

    const cwd = process.cwd();
    const outputPath = path.resolve(options.output || 'GOVERNANCE.md');
    const manifestDir = options.manifests
      ? path.resolve(options.manifests)
      : path.join(cwd, 'protocols');

    const sections = resolveSections(options.sections);

    const generatorOptions = {
      sections,
      includeDiagrams: options.diagrams !== false,
      includePIIFlow: options.pii !== false,
      includeMetrics: options.metrics !== false
    };

    log.info('Initializing governance generator...');
    const { graph, manifests } = await loadWorkspaceGraph(manifestDir, log);

    // Try to use full GovernanceGenerator; fall back to a lightweight generator if unavailable
    try {
      const Gov = require('../../core/governance');
      const Overrides = require('../../core/overrides');
      const { GovernanceGenerator } = Gov;
      const { OverrideEngine } = Overrides;

      const overrideEngine = new OverrideEngine(cwd);
      const generator = new GovernanceGenerator({ graph, overrideEngine, manifests });

      let result;
      if (options.update) {
        log.info(`Updating governance documentation at ${outputPath}`);
        result = await generator.update(outputPath, generatorOptions);
      } else {
        log.info(`Generating governance documentation at ${outputPath}`);
        result = await generator.generateToFile(outputPath, generatorOptions);
      }

      log.success(
        `GOVERNANCE.md ${options.update ? 'updated' : 'generated'} (${result.size} bytes)`,
        { outputPath }
      );
      return result;
    } catch (e) {
      // Lightweight fallback
      log.warn('Full governance generator unavailable; using lightweight fallback');

      const summary = [];
      summary.push('# Protocol Governance');
      summary.push('');
      summary.push('This is a lightweight governance report. Install/fix core governance modules for full output.');
      summary.push('');
      summary.push('## Workspace Summary');
      summary.push(`- Manifests: ${manifests.length}`);
      try {
        const stats = graph.getStats ? graph.getStats() : null;
        if (stats) {
          summary.push(`- Nodes: ${stats.nodes}`);
          summary.push(`- Edges: ${stats.edges}`);
        }
      } catch {}
      summary.push('');
      summary.push('## Notes');
      summary.push('- Dependency diagrams and PII flow require the full generator.');
      summary.push('');

      await fs.outputFile(outputPath, summary.join('\n'));
      const size = (await fs.stat(outputPath)).size;
      log.success(`GOVERNANCE.md generated (${size} bytes)`, { outputPath });
      return { size, path: outputPath };
    }
  } catch (error) {
    log.error(`Governance generation failed: ${error.message}`, { error });
    if (usingConsole) {
      process.exitCode = 1;
    }
    return null;
  }
}

export {
  governanceCommand
};
