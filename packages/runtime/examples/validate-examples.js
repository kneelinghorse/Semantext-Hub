#!/usr/bin/env node

/**
 * Simple validation script for the integration examples
 * Validates that the examples are syntactically correct and self-consistent
 */

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

const EXAMPLES_DIR = './examples';

async function validateExamples() {
  console.log(chalk.blue('\n🔍 Validating Integration Examples\n'));
  
  const examples = [
    'enterprise-pipeline',
    'observability-integration'
  ];
  
  let totalErrors = 0;
  let totalWarnings = 0;
  
  for (const example of examples) {
    console.log(chalk.blue(`\n📁 Validating ${example}...`));
    
    const exampleDir = path.join(EXAMPLES_DIR, example);
    const files = await fs.readdir(exampleDir);
    
    // Find all JSON protocol files
    const protocolFiles = files.filter(f => f.endsWith('-protocol.json'));
    
    console.log(chalk.gray(`  Found ${protocolFiles.length} protocol files`));
    
    for (const file of protocolFiles) {
      const filePath = path.join(exampleDir, file);
      console.log(chalk.gray(`    Validating ${file}...`));
      
      try {
        const content = await fs.readJson(filePath);
        
        // Basic validation
        const errors = [];
        const warnings = [];
        
        // Check required fields
        if (!content.urn) {
          errors.push('Missing URN field');
        }
        
        if (!content.metadata) {
          errors.push('Missing metadata field');
        } else {
          if (!content.metadata.urn) {
            errors.push('Missing metadata.urn');
          }
          if (!content.metadata.name) {
            warnings.push('Missing metadata.name');
          }
          if (!content.metadata.version) {
            warnings.push('Missing metadata.version');
          }
        }
        
        if (!content.service) {
          errors.push('Missing service field');
        } else {
          if (!content.service.name) {
            errors.push('Missing service.name');
          }
          if (!content.service.type) {
            errors.push('Missing service.type');
          }
        }
        
        // Check URN format
        if (content.urn) {
          const urnPattern = /^urn:proto:(api|data|event|workflow):[^/]+/[^@]+@v\d+$/;
          if (!urnPattern.test(content.urn)) {
            errors.push(`Invalid URN format: ${content.urn}`);
          }
        }
        
        // Check dependencies
        if (content.dependencies && Array.isArray(content.dependencies)) {
          for (const dep of content.dependencies) {
            if (!dep.urn) {
              errors.push('Dependency missing URN');
            } else if (!urnPattern.test(dep.urn)) {
              errors.push(`Invalid dependency URN format: ${dep.urn}`);
            }
          }
        }
        
        if (errors.length > 0) {
          console.log(chalk.red(`    ❌ ${file}: ${errors.length} errors`));
          errors.forEach(error => {
            console.log(chalk.red(`      - ${error}`));
          });
          totalErrors += errors.length;
        } else {
          console.log(chalk.green(`    ✅ ${file}: Valid`));
        }
        
        if (warnings.length > 0) {
          warnings.forEach(warning => {
            console.log(chalk.yellow(`      ⚠ ${warning}`));
          });
          totalWarnings += warnings.length;
        }
        
      } catch (error) {
        console.log(chalk.red(`    ❌ ${file}: Parse error - ${error.message}`));
        totalErrors++;
      }
    }
    
    // Check for README
    if (files.includes('README.md')) {
      console.log(chalk.green(`    ✅ README.md: Present`));
    } else {
      console.log(chalk.yellow(`    ⚠ README.md: Missing`));
      totalWarnings++;
    }
    
    // Check for workflow file
    const workflowFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    if (workflowFiles.length > 0) {
      console.log(chalk.green(`    ✅ Workflow files: ${workflowFiles.join(', ')}`));
    } else {
      console.log(chalk.yellow(`    ⚠ Workflow files: Missing`));
      totalWarnings++;
    }
  }
  
  console.log(chalk.blue('\n📊 Validation Summary'));
  console.log('───────────────────────────────────────────────────');
  
  if (totalErrors === 0) {
    console.log(chalk.green(`✅ All examples are syntactically valid`));
  } else {
    console.log(chalk.red(`❌ Validation failed with ${totalErrors} error(s)`));
  }
  
  if (totalWarnings > 0) {
    console.log(chalk.yellow(`⚠ ${totalWarnings} warning(s) found`));
  }
  
  console.log(chalk.gray(`Examples validated: ${examples.length}`));
  
  return totalErrors === 0;
}

// Run validation
validateExamples()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error(chalk.red(`\n❌ Validation failed: ${error.message}`));
    process.exit(1);
  });
