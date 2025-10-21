/**
 * Validation Service
 *
 * Orchestrates structural validation, cross-protocol validation,
 * diffing, breaking-change analysis, and migration guidance.
 */

import fs from 'fs-extra';
import path from 'path';
import { validateManifest } from './validator.js';
import { CrossValidator } from '../../protocols/validation/cross-validator.js';
import { DiffEngine } from '../../protocols/diff/engine.js';
import { BreakingChangeDetector } from '../../protocols/diff/breaking-detector.js';
import { MigrationSuggester } from '../../protocols/diff/migration-suggester.js';
import { loadManifestsFromDirectory, buildGraph } from './graph-builder.js';
import { getApprovedPath } from './paths.js';

function normalizeStructuralIssues(issues, severity) {
  return issues.map(issue => ({
    source: 'structural',
    severity,
    field: issue.field,
    message: issue.message
  }));
}

function normalizeCrossIssues(issues, severity) {
  return issues.map(issue => ({
    source: 'cross_protocol',
    severity,
    ...issue
  }));
}

async function buildValidationContext(manifestPath, manifestOverride) {
  const baseDir = path.dirname(manifestPath);
  const rawEntries = await loadManifestsFromDirectory(baseDir);

  const loadErrors = rawEntries
    .filter(entry => !entry.manifest && entry.error)
    .map(entry => ({ path: entry.path, error: entry.error }));

  const manifestsByURN = new Map();

  for (const entry of rawEntries) {
    if (!entry.manifest) continue;
    const urn = entry.manifest?.metadata?.urn;
    if (!urn) continue;

    const manifestData = entry.path === manifestPath && manifestOverride
      ? manifestOverride
      : entry.manifest;

    if (!manifestsByURN.has(urn) || entry.path === manifestPath) {
      manifestsByURN.set(urn, {
        path: entry.path,
        manifest: manifestData
      });
    }
  }

  if (manifestOverride?.metadata?.urn && !manifestsByURN.has(manifestOverride.metadata.urn)) {
    manifestsByURN.set(manifestOverride.metadata.urn, {
      path: manifestPath,
      manifest: manifestOverride
    });
  }

  const manifests = Array.from(manifestsByURN.values());
  const { graph, stats } = buildGraph(manifests);

  const approvedPath = getApprovedPath(manifestPath);
  let previousManifest = null;
  let previousManifestPath = null;
  if (await fs.pathExists(approvedPath)) {
    try {
      previousManifest = await fs.readJson(approvedPath);
      previousManifestPath = approvedPath;
    } catch (error) {
      loadErrors.push({ path: approvedPath, error });
    }
  }

  return {
    baseDir,
    manifests,
    graph,
    stats,
    loadErrors,
    previousManifest,
    previousManifestPath
  };
}

function combineResults(structuralResult, crossResult, approvedValid = true) {
  const structuralErrors = normalizeStructuralIssues(structuralResult.errors, 'error');
  const structuralWarnings = normalizeStructuralIssues(structuralResult.warnings, 'warning');
  const structuralSuggestions = structuralResult.suggestions || [];

  const crossErrors = normalizeCrossIssues(crossResult.issues.errors || [], 'error');
  const crossWarnings = normalizeCrossIssues(crossResult.issues.warnings || [], 'warning');
  const crossInfo = normalizeCrossIssues(crossResult.issues.info || [], 'info');

  return {
    valid: structuralResult.valid && approvedValid,
    errors: [...structuralErrors, ...crossErrors],
    warnings: [...structuralWarnings, ...crossWarnings],
    info: crossInfo,
    suggestions: structuralSuggestions
  };
}

async function runFullValidation({
  manifestPath,
  manifest,
  options = {}
}) {
  const structuralResult = validateManifest(manifest);
  const context = await buildValidationContext(manifestPath, manifest);

  const crossValidator = new CrossValidator(context.graph);
  const crossResult = crossValidator.validate(manifest, options.crossValidatorOptions || {});
  const approvedStructuralResult = context.previousManifest
    ? validateManifest(context.previousManifest)
    : null;

  const combined = combineResults(
    structuralResult,
    crossResult,
    approvedStructuralResult?.valid ?? true
  );

  let diffReport = null;
  let breakingAnalysis = null;
  let migrationGuide = null;

  if (context.previousManifest && options.includeDiff !== false) {
    const diffEngine = new DiffEngine(options.diffOptions || {});
    diffReport = diffEngine.diff(context.previousManifest, manifest);

    const detector = new BreakingChangeDetector(context.graph);
    breakingAnalysis = detector.detectBreakingChanges(diffReport, manifest.metadata?.urn);

    if (options.includeMigration !== false) {
      const suggester = new MigrationSuggester(options.migrationOptions || {});
      migrationGuide = suggester.generateMigrationGuide(diffReport, breakingAnalysis);
    }
  }

  const graphStats = {
    nodes: context.graph.graph.order,
    edges: context.graph.graph.size,
    cache: context.graph.getCacheStats(),
    build: context.stats
  };

  return {
    structural: structuralResult,
    cross: crossResult,
    combined,
    diff: diffReport,
    breaking: breakingAnalysis,
    migration: migrationGuide,
    graph: graphStats,
    context: {
      directory: context.baseDir,
      manifestsLoaded: context.manifests.length,
      loadErrors: context.loadErrors,
      previousManifestPath: context.previousManifestPath
    }
  };
}

export {
  runFullValidation
};
