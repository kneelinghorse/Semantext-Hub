#!/usr/bin/env node
/**
 * CI Guard Script: Registry Single-Entry Enforcement
 * 
 * Mission: IM-01D-20251104
 * 
 * This script enforces the single-entry architecture by:
 * 1. Detecting banned patterns (legacy server usage)
 * 2. Running the parity test suite
 * 3. Validating that the runtime server is the sole entry point
 * 
 * Exit codes:
 * 0 - All checks passed
 * 1 - Banned pattern detected or parity test failed
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '../..');

// Banned patterns that indicate legacy server usage
const BANNED_PATTERNS = [
  {
    pattern: /startHttpServer\s*\(/g,
    name: 'startHttpServer',
    message: 'Legacy startHttpServer pattern detected. Use createServer or startServer from packages/runtime/registry/server.mjs instead.',
    allowedFiles: [
      // Legacy file that's marked deprecated but still exists for compatibility
      'app/services/registry/server.mjs',
      // Test files that might reference it in migration docs
      'docs/runtime/registry-migration-notes.md',
      // This guard script itself
      'scripts/ci/check-registry-single-entry.mjs',
    ],
  },
  {
    pattern: /from\s+['"].*?app\/services\/registry\/server\.mjs['"]/g,
    name: 'legacy import',
    message: 'Import from legacy app/services/registry/server.mjs detected. Use packages/runtime/registry/server.mjs instead.',
    allowedFiles: [
      'app/services/registry/server.mjs', // The file itself can import
      'docs/runtime/registry-migration-notes.md',
      'scripts/ci/check-registry-single-entry.mjs',
      'tests/runtime/registry.http.parity.spec.mjs', // Parity test documents the migration
    ],
  },
  {
    pattern: /RegistryStore\s+/g,
    name: 'RegistryStore class',
    message: 'Legacy RegistryStore class usage detected. Use SQLite repository from packages/runtime/registry/repository.mjs instead.',
    allowedFiles: [
      'docs/runtime/registry-migration-notes.md',
      'scripts/ci/check-registry-single-entry.mjs',
    ],
  },
];

const FILE_PATTERNS = [
  'app/**/*.{js,mjs,ts}',
  'packages/**/*.{js,mjs,ts}',
  'tests/**/*.{js,mjs,spec.mjs,test.mjs}',
  'cli/**/*.{js,mjs,ts}',
  'src/**/*.{js,mjs,ts}',
];

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/coverage/**',
  '**/artifacts/**',
  '**/dist/**',
  '**/build/**',
  '**/.artifacts/**',
];

async function* walkDir(dir, ignorePatterns) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = fullPath.replace(ROOT + '/', '');
      
      // Check if path matches any ignore pattern
      const shouldIgnore = ignorePatterns.some(pattern => {
        const cleanPattern = pattern.replace(/^\*\*\//, '').replace(/\/\*\*$/, '');
        return relativePath.includes(cleanPattern) || entry.name === cleanPattern;
      });
      
      if (shouldIgnore) continue;
      
      if (entry.isDirectory()) {
        yield* walkDir(fullPath, ignorePatterns);
      } else if (entry.isFile()) {
        // Check if file matches any of the extensions we care about
        if (/\.(js|mjs|ts|tsx)$/.test(entry.name)) {
          yield fullPath;
        }
      }
    }
  } catch (err) {
    // Ignore permission errors and continue
  }
}

async function findFiles() {
  const allFiles = [];
  const searchDirs = ['app', 'packages', 'tests', 'cli', 'src'];
  
  for (const dir of searchDirs) {
    const fullDir = join(ROOT, dir);
    try {
      for await (const file of walkDir(fullDir, IGNORE_PATTERNS)) {
        allFiles.push(file);
      }
    } catch (err) {
      // Directory might not exist, skip it
    }
  }
  
  return [...new Set(allFiles)]; // Deduplicate
}

function isFileAllowed(filePath, allowedFiles) {
  // Convert absolute path to relative for comparison
  const relativePath = filePath.replace(ROOT + '/', '');
  return allowedFiles.some(allowed => {
    // Exact match or parent directory match
    return relativePath === allowed || relativePath.endsWith('/' + allowed);
  });
}

async function checkBannedPatterns() {
  console.log('🔍 Scanning for banned patterns...\n');
  
  const files = await findFiles();
  const violations = [];
  
  for (const filePath of files) {
    const content = await readFile(filePath, 'utf8');
    const relativePath = filePath.replace(ROOT + '/', '');
    
    for (const { pattern, name, message, allowedFiles } of BANNED_PATTERNS) {
      if (isFileAllowed(filePath, allowedFiles)) {
        continue; // Skip allowed files
      }
      
      const matches = content.match(pattern);
      if (matches) {
        violations.push({
          file: relativePath,
          pattern: name,
          message,
          occurrences: matches.length,
        });
      }
    }
  }
  
  if (violations.length > 0) {
    console.error('❌ BANNED PATTERN VIOLATIONS DETECTED:\n');
    for (const { file, pattern, message, occurrences } of violations) {
      console.error(`  File: ${file}`);
      console.error(`  Pattern: ${pattern} (${occurrences} occurrence${occurrences > 1 ? 's' : ''})`);
      console.error(`  Issue: ${message}\n`);
    }
    return false;
  }
  
  console.log('✅ No banned patterns detected\n');
  return true;
}

async function runParityTests() {
  console.log('🧪 Running registry parity tests...\n');
  
  return new Promise((resolve) => {
    const jestPath = join(ROOT, 'node_modules/jest/bin/jest.js');
    const testPath = join(ROOT, 'tests/runtime/registry.http.parity.spec.mjs');
    
    const child = spawn(
      'node',
      [
        '--experimental-vm-modules',
        jestPath,
        '--runTestsByPath',
        testPath,
        '--testTimeout=30000',
      ],
      {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, JEST_SKIP_THRESHOLDS: '1' },
      }
    );
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ Parity tests passed\n');
        resolve(true);
      } else {
        console.error('\n❌ Parity tests failed\n');
        resolve(false);
      }
    });
    
    child.on('error', (err) => {
      console.error('\n❌ Failed to run parity tests:', err.message);
      resolve(false);
    });
  });
}

async function checkRuntimeServerExists() {
  console.log('📋 Verifying runtime server exists...\n');
  
  const serverPath = join(ROOT, 'packages/runtime/registry/server.mjs');
  try {
    const content = await readFile(serverPath, 'utf8');
    
    // Verify it exports the required functions
    const hasCreateServer = /export\s+(async\s+)?function\s+createServer/.test(content);
    const hasStartServer = /export\s+(async\s+)?function\s+startServer/.test(content);
    
    if (!hasCreateServer || !hasStartServer) {
      console.error('❌ Runtime server missing required exports (createServer, startServer)\n');
      return false;
    }
    
    console.log('✅ Runtime server exports verified\n');
    return true;
  } catch (err) {
    console.error(`❌ Runtime server not found at ${serverPath}\n`);
    return false;
  }
}

async function main() {
  console.log('🚀 Registry Single-Entry Guard Script\n');
  console.log('═'.repeat(60) + '\n');
  
  const checks = [
    { name: 'Runtime Server Exists', fn: checkRuntimeServerExists },
    { name: 'Banned Patterns', fn: checkBannedPatterns },
    { name: 'Parity Tests', fn: runParityTests },
  ];
  
  let allPassed = true;
  
  for (const { name, fn } of checks) {
    console.log(`Running check: ${name}`);
    const passed = await fn();
    if (!passed) {
      allPassed = false;
      console.log(`❌ Check failed: ${name}\n`);
    }
    console.log('─'.repeat(60) + '\n');
  }
  
  if (allPassed) {
    console.log('✅ All registry single-entry checks passed!\n');
    process.exit(0);
  } else {
    console.error('❌ Some checks failed. Please fix the issues above.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});

