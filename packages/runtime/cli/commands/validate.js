/**
 * Validate CLI Command
 * 
 * Ecosystem validation for protocol manifests
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { performance } from 'perf_hooks';
import { loadManifestsFromDirectory, buildGraph } from '../../workflow/graph-builder.js';
import { CrossValidator } from '../../validation/cross-validator.js';
import { validateManifest } from '../../workflow/validator.js';

/**
 * Ecosystem validation command
 */
export async function validateCommand(options = {}) {
  const startTime = performance.now();
  
  try {
    if (!options.ecosystem) {
      console.log(chalk.red('Error: --ecosystem flag is required'));
      console.log(chalk.gray('Usage: ossp validate --ecosystem [options]'));
      process.exit(1);
    }

    console.log(chalk.blue('\n🔍 Ecosystem Validation Engine\n'));
    console.log(chalk.gray(`Manifests directory: ${options.manifests}`));
    console.log(chalk.gray(`Output format: ${options.format}`));
    if (options.output) {
      console.log(chalk.gray(`Output file: ${options.output}`));
    }
    console.log('');

    // Load all manifests from directory
    console.log(chalk.blue('📦 Loading manifests...'));
    const loadStart = performance.now();
    const entries = await loadManifestsFromDirectory(options.manifests);
    const loadTime = performance.now() - loadStart;
    
    const validManifests = entries.filter(e => e.manifest);
    const loadErrors = entries.filter(e => e.error);
    
    console.log(chalk.green(`✓ Loaded ${validManifests.length} manifests in ${loadTime.toFixed(2)}ms`));
    if (loadErrors.length > 0) {
      console.log(chalk.yellow(`⚠ ${loadErrors.length} load errors:`));
      loadErrors.forEach(error => {
        console.log(chalk.gray(`  - ${error.path}: ${error.error.message}`));
      });
    }

    if (validManifests.length === 0) {
      console.log(chalk.red('❌ No valid manifests found'));
      process.exit(1);
    }

    // Build protocol graph
    console.log(chalk.blue('\n🔗 Building protocol graph...'));
    const graphStart = performance.now();
    const { graph } = buildGraph(validManifests);
    const graphTime = performance.now() - graphStart;
    
    console.log(chalk.green(`✓ Graph built in ${graphTime.toFixed(2)}ms`));
    console.log(chalk.gray(`  Nodes: ${graph.graph.order}`));
    console.log(chalk.gray(`  Edges: ${graph.graph.size}`));

    // Initialize cross-validator with governance rules v0.1
    console.log(chalk.blue('\n⚖️  Initializing validation rules...'));
    const validator = new CrossValidator(graph);
    
    // Register Governance Rules v0.1
    registerGovernanceRules(validator);
    
    console.log(chalk.green(`✓ ${validator.rules.size} validation rules registered`));

    // Validate ecosystem
    console.log(chalk.blue('\n🔍 Validating ecosystem...'));
    const validationStart = performance.now();
    
    const ecosystemResults = [];
    let totalErrors = 0;
    let totalWarnings = 0;
    let totalInfo = 0;

    for (const entry of validManifests) {
      const result = validator.validate(entry.manifest, {
        rules: ['urn_references', 'version_compatibility', 'circular_dependencies', 'integration_conflicts', 'governance_rules_v0_1']
      });
      
      ecosystemResults.push({
        manifest: entry.manifest,
        path: entry.path,
        result
      });
      
      totalErrors += result.issues.errors.length;
      totalWarnings += result.issues.warnings.length;
      totalInfo += result.issues.info.length;
    }

    const validationTime = performance.now() - validationStart;
    const totalTime = performance.now() - startTime;

    // Generate validation report
    const report = {
      summary: {
        totalManifests: validManifests.length,
        totalErrors,
        totalWarnings,
        totalInfo,
        validationTime: validationTime,
        totalTime: totalTime,
        performance: {
          loadTime,
          graphTime,
          validationTime,
          totalTime
        }
      },
      results: ecosystemResults,
      graph: {
        nodes: graph.graph.order,
        edges: graph.graph.size,
        cache: graph.getCacheStats()
      },
      timestamp: new Date().toISOString()
    };

    // Display results
    console.log(chalk.blue('\n📊 Validation Results'));
    console.log('───────────────────────────────────────────────────');
    
    if (totalErrors === 0) {
      console.log(chalk.green(`✓ Ecosystem validation passed`));
    } else {
      console.log(chalk.red(`❌ Ecosystem validation failed`));
    }
    
    console.log(chalk.gray(`Manifests: ${validManifests.length}`));
    console.log(chalk.gray(`Errors: ${totalErrors}`));
    console.log(chalk.gray(`Warnings: ${totalWarnings}`));
    console.log(chalk.gray(`Info: ${totalInfo}`));
    console.log(chalk.gray(`Validation time: ${validationTime.toFixed(2)}ms`));
    console.log(chalk.gray(`Total time: ${totalTime.toFixed(2)}ms`));

    // Performance check with enhanced metrics
    const avgValidationTime = validationTime / validManifests.length;
    if (validationTime > 1000) {
      console.log(chalk.yellow(`⚠ Performance warning: Validation took ${validationTime.toFixed(2)}ms (>1s target)`));
      console.log(chalk.gray(`  Average per protocol: ${avgValidationTime.toFixed(2)}ms`));
    } else {
      console.log(chalk.green(`✓ Performance target met: ${validationTime.toFixed(2)}ms < 1s`));
      console.log(chalk.gray(`  Average per protocol: ${avgValidationTime.toFixed(2)}ms`));
    }

    // Show performance breakdown if verbose
    if (options.verbose && ecosystemResults.length > 0) {
      const performanceBreakdown = ecosystemResults.map(r => r.result.performance).filter(p => p);
      if (performanceBreakdown.length > 0) {
        const avgRuleTime = performanceBreakdown.reduce((sum, p) => sum + p.averageRuleTime, 0) / performanceBreakdown.length;
        console.log(chalk.gray(`  Average rule execution time: ${avgRuleTime.toFixed(2)}ms`));
      }
    }

    // Show detailed issues if verbose
    if (options.verbose && (totalErrors > 0 || totalWarnings > 0)) {
      console.log(chalk.blue('\n🔍 Detailed Issues'));
      console.log('───────────────────────────────────────────────────');
      
      ecosystemResults.forEach(({ manifest, path, result }) => {
        if (result.issues.errors.length > 0 || result.issues.warnings.length > 0) {
          console.log(chalk.yellow(`\n📄 ${path}`));
          console.log(chalk.gray(`URN: ${manifest.metadata?.urn || 'unknown'}`));
          
          if (result.issues.errors.length > 0) {
            console.log(chalk.red(`  Errors (${result.issues.errors.length}):`));
            result.issues.errors.forEach((error, i) => {
              console.log(chalk.red(`    ${i + 1}. ${error.message}`));
              if (error.field) console.log(chalk.gray(`       Field: ${error.field}`));
              if (error.suggestion) console.log(chalk.gray(`       Suggestion: ${error.suggestion}`));
            });
          }
          
          if (result.issues.warnings.length > 0) {
            console.log(chalk.yellow(`  Warnings (${result.issues.warnings.length}):`));
            result.issues.warnings.forEach((warning, i) => {
              console.log(chalk.yellow(`    ${i + 1}. ${warning.message}`));
              if (warning.field) console.log(chalk.gray(`       Field: ${warning.field}`));
            });
          }
        }
      });
    }

    // Output to file if specified
    if (options.output) {
      const outputPath = path.resolve(options.output);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      
      if (options.format === 'json') {
        await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
        console.log(chalk.green(`\n✓ Report written to ${outputPath}`));
      } else {
        // Write summary format
        const summaryText = generateSummaryReport(report);
        await fs.writeFile(outputPath, summaryText);
        console.log(chalk.green(`\n✓ Summary report written to ${outputPath}`));
      }
    }

    // Exit with appropriate code
    const exitCode = totalErrors > 0 ? 1 : 0;
    if (exitCode !== 0) {
      console.log(chalk.red(`\n❌ Validation failed with ${totalErrors} error(s)`));
    } else {
      console.log(chalk.green(`\n✅ Ecosystem validation completed successfully`));
    }
    
    process.exit(exitCode);

  } catch (error) {
    console.error(chalk.red(`\n❌ Validation failed:`));
    console.error(chalk.red(`  ${error.message}`));
    if (options.verbose) {
      console.error(chalk.gray(`  ${error.stack}`));
    }
    process.exit(1);
  }
}

/**
 * Register Governance Rules v0.1
 */
function registerGovernanceRules(validator) {
  // Rule 1: Missing schema validation
  validator.registerRule('missing_schema', (manifest, graph) => {
    const issues = [];
    
    // Check for missing schema references in API protocols
    if (manifest.catalog && manifest.catalog.endpoints) {
      manifest.catalog.endpoints.forEach((endpoint, index) => {
        if (!endpoint.requestSchema && !endpoint.responseSchema) {
          issues.push({
            message: `Endpoint "${endpoint.path}" missing request/response schema`,
            field: `catalog.endpoints[${index}]`,
            severity: 'warning',
            suggestion: 'Define requestSchema and/or responseSchema for better validation'
          });
        }
      });
    }
    
    // Check for missing schema in data protocols
    if (manifest.service && manifest.service.entities) {
      manifest.service.entities.forEach((entity, index) => {
        if (!entity.schema) {
          issues.push({
            message: `Entity "${entity.name}" missing schema definition`,
            field: `service.entities[${index}]`,
            severity: 'error',
            suggestion: 'Define schema property for entity validation'
          });
        }
      });
    }
    
    return issues;
  }, { type: 'governance', severity: 'warning' });

  // Rule 2: Cyclic dependency detection
  validator.registerRule('cyclic_dependency', (manifest, graph) => {
    const issues = [];
    const urn = manifest.metadata?.urn;
    
    if (!urn) return issues;
    
    // Check for cycles in dependency chain
    const visited = new Set();
    const recursionStack = new Set();
    
    function hasCycle(nodeUrn) {
      if (recursionStack.has(nodeUrn)) {
        return true; // Cycle detected
      }
      
      if (visited.has(nodeUrn)) {
        return false; // Already processed
      }
      
      visited.add(nodeUrn);
      recursionStack.add(nodeUrn);
      
      const node = graph.getNode(nodeUrn);
      if (node && node.manifest && node.manifest.dependencies) {
        for (const dep of node.manifest.dependencies.depends_on || []) {
          if (hasCycle(dep)) {
            return true;
          }
        }
      }
      
      recursionStack.delete(nodeUrn);
      return false;
    }
    
    if (hasCycle(urn)) {
      issues.push({
        message: `Circular dependency detected in protocol chain`,
        field: 'dependencies.depends_on',
        severity: 'error',
        suggestion: 'Review dependency chain to eliminate circular references'
      });
    }
    
    return issues;
  }, { type: 'governance', severity: 'error' });

  // Rule 3: Duplicate URN detection
  validator.registerRule('duplicate_urn', (manifest, graph) => {
    const issues = [];
    const urn = manifest.metadata?.urn;
    
    if (!urn) return issues;
    
    // Check if URN already exists in graph
    const existingNode = graph.getNode(urn);
    if (existingNode && existingNode.manifest !== manifest) {
      issues.push({
        message: `Duplicate URN detected: ${urn}`,
        field: 'metadata.urn',
        severity: 'error',
        suggestion: 'Ensure URN is unique across all protocols'
      });
    }
    
    return issues;
  }, { type: 'governance', severity: 'error' });

  // Register composite rule for all governance rules
  validator.registerRule('governance_rules_v0_1', (manifest, graph) => {
    const allIssues = [];
    
    // Run all governance rules
    const rules = ['missing_schema', 'cyclic_dependency', 'duplicate_urn'];
    rules.forEach(ruleName => {
      const rule = validator.rules.get(ruleName);
      if (rule && rule.enabled) {
        try {
          const issues = rule.fn(manifest, graph) || [];
          allIssues.push(...issues);
        } catch (error) {
          allIssues.push({
            message: `Governance rule ${ruleName} failed: ${error.message}`,
            severity: 'error'
          });
        }
      }
    });
    
    return allIssues;
  }, { type: 'governance', severity: 'error' });
}

/**
 * Generate summary report text
 */
function generateSummaryReport(report) {
  const { summary, results } = report;
  
  let text = `# Ecosystem Validation Report\n\n`;
  text += `**Generated:** ${report.timestamp}\n`;
  text += `**Total Manifests:** ${summary.totalManifests}\n`;
  text += `**Errors:** ${summary.totalErrors}\n`;
  text += `**Warnings:** ${summary.totalWarnings}\n`;
  text += `**Info:** ${summary.totalInfo}\n`;
  text += `**Validation Time:** ${summary.validationTime.toFixed(2)}ms\n`;
  text += `**Total Time:** ${summary.totalTime.toFixed(2)}ms\n\n`;
  
  if (summary.totalErrors > 0) {
    text += `## ❌ Validation Failed\n\n`;
    text += `The ecosystem validation failed with ${summary.totalErrors} error(s).\n\n`;
    
    text += `### Error Details\n\n`;
    results.forEach(({ manifest, path, result }) => {
      if (result.issues.errors.length > 0) {
        text += `#### ${path}\n`;
        text += `**URN:** ${manifest.metadata?.urn || 'unknown'}\n\n`;
        result.issues.errors.forEach((error, i) => {
          text += `${i + 1}. **${error.message}**\n`;
          if (error.field) text += `   - Field: ${error.field}\n`;
          if (error.suggestion) text += `   - Suggestion: ${error.suggestion}\n`;
          text += `\n`;
        });
      }
    });
  } else {
    text += `## ✅ Validation Passed\n\n`;
    text += `The ecosystem validation completed successfully.\n\n`;
  }
  
  if (summary.totalWarnings > 0) {
    text += `## ⚠️ Warnings\n\n`;
    results.forEach(({ manifest, path, result }) => {
      if (result.issues.warnings.length > 0) {
        text += `#### ${path}\n`;
        result.issues.warnings.forEach((warning, i) => {
          text += `${i + 1}. ${warning.message}\n`;
        });
        text += `\n`;
      }
    });
  }
  
  return text;
}
