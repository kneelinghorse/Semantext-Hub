#!/usr/bin/env node

/**
 * Generate Property-Based Tests
 * Mission B7.6.0 - Test Infrastructure & CI
 */

import { generatePropertyTests } from '../test-infrastructure/property-tester.js';

async function main() {
  console.log('🧪 Generating Property-Based Tests...');
  
  try {
    const tests = await generatePropertyTests({ verbose: true });
    
    console.log('✅ Property-based tests generated successfully');
    console.log(`📊 Generated tests for ${Object.keys(tests).length} categories:`);
    
    for (const [category, categoryTests] of Object.entries(tests)) {
      console.log(`  - ${category}: ${Object.keys(categoryTests).length} test files`);
    }
    
    console.log('\n📁 Test files written to: tests/property/');
    console.log('📁 Generator files written to: tests/fixtures/generated/');
    
  } catch (error) {
    console.error('❌ Failed to generate property-based tests:', error.message);
    process.exit(1);
  }
}

main();
