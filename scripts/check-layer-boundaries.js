#!/usr/bin/env node

/**
 * Layer Boundary Checker
 * 
 * Ensures protocols package cannot import from runtime package.
 * This enforces clean separation between protocol contracts and runtime adapters.
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTOCOLS_DIR = path.join(__dirname, '../packages/protocols');
const RUNTIME_DIR = path.join(__dirname, '../packages/runtime');

/**
 * Find all JavaScript files in a directory
 */
async function findJSFiles(dir) {
  const files = [];
  
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await walk(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
        files.push(fullPath);
      }
    }
  }
  
  await walk(dir);
  return files;
}

/**
 * Check if a file imports from runtime
 */
async function checkFileForRuntimeImports(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const violations = [];
  
  // Match import statements that reference runtime
  const importRegex = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  
  let match;
  
  // Check ES6 imports
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (importPath.includes('packages/runtime') || importPath.includes('../runtime') || importPath.includes('./runtime')) {
      violations.push({
        line: content.substring(0, match.index).split('\n').length,
        import: importPath,
        type: 'import'
      });
    }
  }
  
  // Check CommonJS requires
  while ((match = requireRegex.exec(content)) !== null) {
    const requirePath = match[1];
    if (requirePath.includes('packages/runtime') || requirePath.includes('../runtime') || requirePath.includes('./runtime')) {
      violations.push({
        line: content.substring(0, match.index).split('\n').length,
        import: requirePath,
        type: 'require'
      });
    }
  }
  
  return violations;
}

/**
 * Main check function
 */
async function checkLayerBoundaries() {
  console.log('🔍 Checking layer boundaries...');
  
  try {
    // Find all JS files in protocols package
    const protocolFiles = await findJSFiles(PROTOCOLS_DIR);
    console.log(`📁 Found ${protocolFiles.length} files in protocols package`);
    
    let totalViolations = 0;
    
    for (const file of protocolFiles) {
      const violations = await checkFileForRuntimeImports(file);
      
      if (violations.length > 0) {
        const relativePath = path.relative(PROTOCOLS_DIR, file);
        console.log(`❌ ${relativePath}:`);
        
        for (const violation of violations) {
          console.log(`   Line ${violation.line}: ${violation.type} '${violation.import}'`);
          totalViolations++;
        }
      }
    }
    
    if (totalViolations === 0) {
      console.log('✅ No layer boundary violations found!');
      console.log('🎉 Protocols package is cleanly separated from runtime.');
      return true;
    } else {
      console.log(`\n❌ Found ${totalViolations} layer boundary violations.`);
      console.log('📋 Protocols package must not import from runtime package.');
      console.log('💡 Move shared utilities to protocols package or create a shared package.');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error checking layer boundaries:', error.message);
    return false;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const success = await checkLayerBoundaries();
  process.exit(success ? 0 : 1);
}

export { checkLayerBoundaries };
