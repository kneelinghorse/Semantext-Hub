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

async function loadWorkspaceGraph(manifestDir) {
  if (!manifestDir) {
    return {
      graph: new ProtocolGraph(),
      manifests: []
    };
  }

  const exists = await fs.pathExists(manifestDir);
  if (!exists) {
    printWarning(`Manifest directory not found: ${manifestDir}`);
    return {
      graph: new ProtocolGraph(),
      manifests: []
    };
  }

  const entries = await loadManifestsFromDirectory(manifestDir);
  const validManifests = entries.filter(entry => entry.manifest);

  if (validManifests.length === 0) {
    printWarning(`No manifest files with URNs detected in ${manifestDir}`);
    return {
      graph: new ProtocolGraph(),
      manifests: []
    };
  }

  printInfo(`Loaded ${validManifests.length} manifest(s) from ${manifestDir}`);

  const { graph, stats } = buildGraph(validManifests);

  if (stats.duplicateURNs.length > 0) {
    printWarning(`Duplicate URNs detected: ${stats.duplicateURNs.join(', ')}`);
  }
  if (stats.unresolvedEdges.length > 0) {
    printWarning(`Unresolved dependencies: ${stats.unresolvedEdges.length}`);
  }

  return {
    graph,
    manifests: validManifests.map(entry => entry.manifest)
  };
}

async function governanceCommand(options = {}) {
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

    printInfo('Initializing governance generator...');
    const { graph, manifests } = await loadWorkspaceGraph(manifestDir);

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
        printInfo(`Updating governance documentation at ${outputPath}`);
        result = await generator.update(outputPath, generatorOptions);
      } else {
        printInfo(`Generating governance documentation at ${outputPath}`);
        result = await generator.generateToFile(outputPath, generatorOptions);
      }

      printSuccess(`GOVERNANCE.md ${options.update ? 'updated' : 'generated'} (${result.size} bytes)`);
      return result;
    } catch (e) {
      // Lightweight fallback
      printWarning('Full governance generator unavailable; using lightweight fallback');

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
      printSuccess(`GOVERNANCE.md generated (${size} bytes)`);
      return { size, path: outputPath };
    }
  } catch (error) {
    printError(`Governance generation failed: ${error.message}`);
    process.exitCode = 1;
    return null;
  }
}

export {
  governanceCommand
};
