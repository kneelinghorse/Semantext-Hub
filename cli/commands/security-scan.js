#!/usr/bin/env node

/**
 * Security Scan CLI Command - B11.7
 * 
 * Detects secrets, disallowed licenses, and security vulnerabilities in protocol artifacts.
 * Provides comprehensive security scanning with configurable policies.
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { performance } from 'perf_hooks';

/**
 * Security scan command handler
 */
async function securityScanCommand(options = {}) {
  const startTime = performance.now();
  
  try {
    const {
      target = '.',
      allowViolations = false,
      output = null,
      format = 'summary',
      verbose = false,
      policy = 'default'
    } = options;

    if (options.verbose) {
      console.log(chalk.blue(`\n🔒 Starting security scan...`));
      console.log(chalk.gray(`Target: ${target}`));
      console.log(chalk.gray(`Policy: ${policy}`));
      console.log(chalk.gray(`Allow violations: ${allowViolations}`));
    }

    // Load security policies
    const policies = await loadSecurityPolicies(policy);

    // Scan target
    const scanResults = await scanTarget(target, policies, options);

    // Check for violations
    const hasViolations = scanResults.violations.length > 0;
    const violationCount = scanResults.violations.length;

    if (options.verbose) {
      console.log(chalk.gray(`\nScan completed:`));
      console.log(chalk.gray(`  Files scanned: ${scanResults.filesScanned}`));
      console.log(chalk.gray(`  Violations found: ${violationCount}`));
      console.log(chalk.gray(`  Secrets detected: ${scanResults.secretsFound}`));
      console.log(chalk.gray(`  License violations: ${scanResults.licenseViolations}`));
      console.log(chalk.gray(`  Vulnerabilities: ${scanResults.vulnerabilities}`));
    }

    // Handle violations
    if (hasViolations && !allowViolations) {
      console.error(chalk.red(`\n❌ Security violations detected!`));
      console.error(chalk.yellow(`Found ${violationCount} violations:`));
      
      // Group violations by type
      const violationsByType = groupViolationsByType(scanResults.violations);
      
      for (const [type, violations] of Object.entries(violationsByType)) {
        console.error(chalk.red(`\n${type}:`));
        violations.forEach((violation, index) => {
          console.error(chalk.red(`  ${index + 1}. ${violation.description}`));
          console.error(chalk.gray(`     File: ${violation.file}`));
          console.error(chalk.gray(`     Line: ${violation.line || 'N/A'}`));
          if (violation.severity) {
            console.error(chalk.gray(`     Severity: ${violation.severity}`));
          }
        });
      }

      console.error(chalk.yellow(`\nTo proceed:`));
      console.error(chalk.gray(`  1. Fix the security violations`));
      console.error(chalk.gray(`  2. Use --allow-violations flag to override this check`));
      console.error(chalk.gray(`  3. Update security policies if needed`));
      
      process.exit(1);
    }

    // Generate output
    const outputData = generateOutput(scanResults, format, options);
    
    if (output) {
      await fs.writeFile(output, outputData);
      console.log(chalk.green(`\n✅ Security scan report written to: ${output}`));
    } else {
      console.log(outputData);
    }

    const scanTime = performance.now() - startTime;

    // Summary
    if (hasViolations) {
      console.log(chalk.yellow(`\n⚠️  Security violations detected: ${violationCount}`));
      if (allowViolations) {
        console.log(chalk.green(`✅ Proceeding with violations (override enabled)`));
      }
    } else {
      console.log(chalk.green(`\n✅ No security violations detected`));
    }

    if (options.verbose) {
      console.log(chalk.gray(`Scan time: ${scanTime.toFixed(2)}ms`));
    }

    return {
      success: true,
      hasViolations,
      violationCount,
      scanResults,
      scanTime
    };

  } catch (error) {
    const scanTime = performance.now() - startTime;
    console.error(chalk.red(`\n❌ Security scan failed: ${error.message}`));
    
    if (options.verbose) {
      console.error(chalk.gray(`Scan time: ${scanTime.toFixed(2)}ms`));
      console.error(chalk.gray(`Error details: ${error.stack}`));
    }
    
    throw error;
  }
}

/**
 * Load security policies
 */
async function loadSecurityPolicies(policyName) {
  const defaultPolicies = {
    secrets: {
      patterns: [
        { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/i, description: 'API Key detected' },
        { pattern: /(?:secret[_-]?key|secretkey)\s*[:=]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/i, description: 'Secret Key detected' },
        { pattern: /(?:access[_-]?token|accesstoken)\s*[:=]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/i, description: 'Access Token detected' },
        { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"]?[a-zA-Z0-9@#$%^&*()_+\-=\[\]{}|;:,.<>?]{8,}['"]?/i, description: 'Password detected' },
        { pattern: /(?:private[_-]?key|privatekey)\s*[:=]\s*['"]?-----BEGIN [A-Z ]+-----/i, description: 'Private Key detected' },
        { pattern: /(?:bearer[_-]?token|bearertoken)\s*[:=]\s*['"]?[a-zA-Z0-9]{20,}['"]?/i, description: 'Bearer Token detected' },
        { pattern: /(?:jwt[_-]?token|jwttoken)\s*[:=]\s*['"]?[a-zA-Z0-9._-]{20,}['"]?/i, description: 'JWT Token detected' },
        { pattern: /(?:oauth[_-]?token|oauthtoken)\s*[:=]\s*['"]?[a-zA-Z0-9]{20,}['"]?/i, description: 'OAuth Token detected' }
      ],
      severity: 'high'
    },
    licenses: {
      disallowed: [
        'GPL-2.0', 'GPL-3.0', 'AGPL-1.0', 'AGPL-3.0', 'Copyleft',
        'CC-BY-NC', 'CC-BY-NC-SA', 'CC-BY-NC-ND'
      ],
      allowed: [
        'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause',
        'ISC', 'Unlicense', 'CC0-1.0', 'CC-BY', 'CC-BY-SA'
      ],
      severity: 'medium'
    },
    vulnerabilities: {
      patterns: [
        { pattern: /(?:eval\s*\(|Function\s*\(|setTimeout\s*\(.*,.*\)|setInterval\s*\(.*,.*\))/i, description: 'Code injection risk' },
        { pattern: /(?:innerHTML|outerHTML)\s*=/i, description: 'XSS risk' },
        { pattern: /(?:document\.write|document\.writeln)/i, description: 'DOM manipulation risk' },
        { pattern: /(?:require\s*\(.*http.*\)|import.*http)/i, description: 'HTTP dependency risk' }
      ],
      severity: 'high'
    }
  };

  // Try to load custom policies
  try {
    const customPolicyPath = path.join(process.cwd(), 'security-policies.json');
    const customPolicies = JSON.parse(await fs.readFile(customPolicyPath, 'utf8'));
    return { ...defaultPolicies, ...customPolicies };
  } catch (error) {
    // Use default policies if custom ones don't exist
    return defaultPolicies;
  }
}

/**
 * Scan target directory or file
 */
async function scanTarget(target, policies, options) {
  const results = {
    filesScanned: 0,
    violations: [],
    secretsFound: 0,
    licenseViolations: 0,
    vulnerabilities: 0
  };

  const files = await getFilesToScan(target);
  
  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      results.filesScanned++;
      
      // Scan for secrets
      const secretViolations = scanForSecrets(file, content, policies.secrets);
      results.violations.push(...secretViolations);
      results.secretsFound += secretViolations.length;
      
      // Scan for license violations
      const licenseViolations = scanForLicenseViolations(file, content, policies.licenses);
      results.violations.push(...licenseViolations);
      results.licenseViolations += licenseViolations.length;
      
      // Scan for vulnerabilities
      const vulnerabilityViolations = scanForVulnerabilities(file, content, policies.vulnerabilities);
      results.violations.push(...vulnerabilityViolations);
      results.vulnerabilities += vulnerabilityViolations.length;
      
    } catch (error) {
      if (options.verbose) {
        console.warn(chalk.yellow(`Warning: Could not scan ${file}: ${error.message}`));
      }
    }
  }

  return results;
}

/**
 * Get files to scan
 */
async function getFilesToScan(target) {
  const files = [];
  
  try {
    const stat = await fs.stat(target);
    
    if (stat.isFile()) {
      files.push(target);
    } else if (stat.isDirectory()) {
      const entries = await fs.readdir(target, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(target, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subFiles = await getFilesToScan(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          // Only scan relevant file types
          if (isRelevantFile(fullPath)) {
            files.push(fullPath);
          }
        }
      }
    }
  } catch (error) {
    throw new Error(`Failed to scan target ${target}: ${error.message}`);
  }
  
  return files;
}

/**
 * Check if file is relevant for security scanning
 */
function isRelevantFile(filePath) {
  const relevantExtensions = ['.js', '.ts', '.json', '.yaml', '.yml', '.md', '.txt'];
  const relevantPatterns = ['manifest', 'protocol', 'api', 'event', 'data', 'config'];
  
  // Skip certain directories and files
  const skipPatterns = [
    'node_modules',
    'coverage',
    'dist',
    'build',
    '.git',
    'test',
    'tests',
    '__tests__',
    '.spec.',
    '.test.'
  ];
  
  // Check if file should be skipped
  if (skipPatterns.some(pattern => filePath.includes(pattern))) {
    return false;
  }
  
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath).toLowerCase();
  
  return relevantExtensions.includes(ext) || 
         relevantPatterns.some(pattern => name.includes(pattern));
}

/**
 * Scan for secrets
 */
function scanForSecrets(filePath, content, policies) {
  const violations = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    for (const pattern of policies.patterns) {
      if (pattern.pattern.test(line)) {
        violations.push({
          type: 'Secret',
          description: pattern.description,
          file: filePath,
          line: i + 1,
          severity: policies.severity,
          content: line.trim()
        });
      }
    }
  }
  
  return violations;
}

/**
 * Scan for license violations
 */
function scanForLicenseViolations(filePath, content, policies) {
  const violations = [];
  const lines = content.split('\n');
  
  // Skip license scanning for documentation files and security scan itself
  if (filePath.includes('SECURITY_POLICIES.md') || 
      filePath.includes('README.md') ||
      filePath.includes('security-scan.js')) {
    return violations;
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip comment lines and documentation examples
    if (line.trim().startsWith('//') || 
        line.trim().startsWith('#') || 
        line.trim().startsWith('*') ||
        line.includes('example') ||
        line.includes('Example') ||
        line.includes('allowed') ||
        line.includes('disallowed')) {
      continue;
    }
    
    // Check for disallowed licenses
    for (const disallowedLicense of policies.disallowed) {
      if (line.toLowerCase().includes(disallowedLicense.toLowerCase())) {
        violations.push({
          type: 'License',
          description: `Disallowed license detected: ${disallowedLicense}`,
          file: filePath,
          line: i + 1,
          severity: policies.severity,
          content: line.trim()
        });
      }
    }
  }
  
  return violations;
}

/**
 * Scan for vulnerabilities
 */
function scanForVulnerabilities(filePath, content, policies) {
  const violations = [];
  const lines = content.split('\n');
  
  // Skip vulnerability scanning for documentation files that show examples
  if (filePath.includes('SECURITY_POLICIES.md') || filePath.includes('README.md')) {
    return violations;
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip comment lines and documentation examples
    if (line.trim().startsWith('//') || 
        line.trim().startsWith('#') || 
        line.trim().startsWith('*') ||
        line.includes('example') ||
        line.includes('Example') ||
        line.includes('pattern') ||
        line.includes('Pattern')) {
      continue;
    }
    
    for (const pattern of policies.patterns) {
      if (pattern.pattern.test(line)) {
        violations.push({
          type: 'Vulnerability',
          description: pattern.description,
          file: filePath,
          line: i + 1,
          severity: policies.severity,
          content: line.trim()
        });
      }
    }
  }
  
  return violations;
}

/**
 * Group violations by type
 */
function groupViolationsByType(violations) {
  const grouped = {};
  
  for (const violation of violations) {
    if (!grouped[violation.type]) {
      grouped[violation.type] = [];
    }
    grouped[violation.type].push(violation);
  }
  
  return grouped;
}

/**
 * Generate output based on format
 */
function generateOutput(scanResults, format, options) {
  switch (format) {
    case 'json':
      return JSON.stringify(scanResults, null, 2);
    
    case 'summary':
      return generateSummaryOutput(scanResults, options);
    
    case 'detailed':
      return generateDetailedOutput(scanResults, options);
    
    case 'github':
      return generateGitHubOutput(scanResults, options);
    
    default:
      return generateSummaryOutput(scanResults, options);
  }
}

/**
 * Generate summary output
 */
function generateSummaryOutput(scanResults, options) {
  const { violations, filesScanned } = scanResults;
  
  let output = chalk.blue(`\n🔒 Security Scan Summary\n`);
  output += chalk.gray(`Files scanned: ${filesScanned}\n`);
  output += chalk.gray(`Violations found: ${violations.length}\n\n`);

  if (violations.length === 0) {
    output += chalk.green(`✅ No security violations detected\n`);
    return output;
  }

  // Group violations by type
  const violationsByType = groupViolationsByType(violations);
  
  for (const [type, typeViolations] of Object.entries(violationsByType)) {
    const color = type === 'Secret' ? chalk.red : 
                  type === 'License' ? chalk.yellow : 
                  chalk.orange;
    
    output += color(`\n${type} Violations (${typeViolations.length}):\n`);
    typeViolations.forEach((violation, index) => {
      output += color(`  ${index + 1}. ${violation.description}\n`);
      output += chalk.gray(`     File: ${violation.file}\n`);
      output += chalk.gray(`     Line: ${violation.line}\n`);
      if (options.verbose) {
        output += chalk.gray(`     Content: ${violation.content}\n`);
      }
    });
  }

  return output;
}

/**
 * Generate detailed output
 */
function generateDetailedOutput(scanResults, options) {
  const { violations, filesScanned } = scanResults;
  
  let output = chalk.blue(`\n📋 Detailed Security Scan Report\n`);
  output += chalk.gray(`Files scanned: ${filesScanned}\n`);
  output += chalk.gray(`Total violations: ${violations.length}\n\n`);

  if (violations.length === 0) {
    output += chalk.green(`✅ No security violations detected\n`);
    return output;
  }

  // Sort violations by severity and type
  const sortedViolations = violations.sort((a, b) => {
    const severityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
    const typeOrder = { 'Secret': 3, 'Vulnerability': 2, 'License': 1 };
    
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[b.severity] - severityOrder[a.severity];
    }
    
    return typeOrder[b.type] - typeOrder[a.type];
  });

  sortedViolations.forEach((violation, index) => {
    const color = violation.severity === 'high' ? chalk.red :
                  violation.severity === 'medium' ? chalk.yellow :
                  chalk.gray;
    
    output += color(`\n${index + 1}. ${violation.type}: ${violation.description}\n`);
    output += chalk.gray(`   File: ${violation.file}\n`);
    output += chalk.gray(`   Line: ${violation.line}\n`);
    output += chalk.gray(`   Severity: ${violation.severity}\n`);
    output += chalk.gray(`   Content: ${violation.content}\n`);
  });

  return output;
}

/**
 * Generate GitHub Actions output
 */
function generateGitHubOutput(scanResults, options) {
  const { violations, filesScanned } = scanResults;
  
  let output = '';
  
  // GitHub Actions summary
  if (violations.length > 0) {
    output += `::warning::Security violations detected: ${violations.length}\n`;
    output += `::error::Security scan found ${violations.length} violations that require attention\n`;
  } else {
    output += `::notice::No security violations detected\n`;
  }

  // Detailed report for GitHub
  output += `\n## Security Scan Report\n\n`;
  output += `- **Files scanned:** ${filesScanned}\n`;
  output += `- **Violations found:** ${violations.length}\n\n`;

  if (violations.length > 0) {
    // Group violations by type
    const violationsByType = groupViolationsByType(violations);
    
    for (const [type, typeViolations] of Object.entries(violationsByType)) {
      output += `### ${type} Violations (${typeViolations.length})\n\n`;
      typeViolations.forEach((violation, index) => {
        output += `${index + 1}. **${violation.description}**\n`;
        output += `   - File: \`${violation.file}\`\n`;
        output += `   - Line: ${violation.line}\n`;
        output += `   - Severity: ${violation.severity}\n\n`;
      });
    }
  } else {
    output += `✅ **No security violations detected**\n\n`;
    output += `All scanned files comply with security policies.\n`;
  }

  return output;
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--target' && i + 1 < args.length) {
      options.target = args[++i];
    } else if (arg === '--allow-violations') {
      options.allowViolations = true;
    } else if (arg === '--output' && i + 1 < args.length) {
      options.output = args[++i];
    } else if (arg === '--format' && i + 1 < args.length) {
      options.format = args[++i];
    } else if (arg === '--policy' && i + 1 < args.length) {
      options.policy = args[++i];
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--help') {
      console.log(`
Security Scan Command

Usage: node security-scan.js [options]

Options:
  --target <path>           Target file or directory to scan (default: .)
  --allow-violations        Allow security violations without failing
  --output <file>           Output file path (optional)
  --format <format>         Output format: summary, detailed, json, github (default: summary)
  --policy <name>           Security policy to use (default: default)
  --verbose                 Show detailed output
  --help                    Show this help

Examples:
  node security-scan.js --target ./app
  node security-scan.js --target manifest.json --format github --output security-report.md
  node security-scan.js --target . --allow-violations --verbose
  node security-scan.js --target ./protocols --policy strict
`);
      process.exit(0);
    }
  }
  
  await securityScanCommand(options);
}

// Export for dynamic registry
export { securityScanCommand as securityscanCommand };
