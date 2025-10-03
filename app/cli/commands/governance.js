/**
 * Governance Command
 *
 * Generates GOVERNANCE.md using the GovernanceGenerator.
 */

const path = require('path');
const fs = require('fs-extra');
const { GovernanceGenerator } = require('../../core/governance');
const { OverrideEngine } = require('../../core/overrides');
const { ProtocolGraph } = require('../../core/graph');
const {
  loadManifestsFromDirectory,
  buildGraph
} = require('../../workflow/graph-builder');
const {
  printInfo,
  printSuccess,
  printWarning,
  printError
} = require('../utils/output');

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

    const overrideEngine = new OverrideEngine(cwd);
    const generator = new GovernanceGenerator({
      graph,
      overrideEngine,
      manifests
    });

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
  } catch (error) {
    printError(`Governance generation failed: ${error.message}`);
    process.exitCode = 1;
    return null;
  }
}

module.exports = {
  governanceCommand
};
