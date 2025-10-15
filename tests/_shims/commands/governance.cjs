/**
 * CJS Test Shim for governance command
 */
const fs = require('fs-extra');

async function governanceCommand(options = {}) {
  try {
    const outputPath = options.output || 'GOVERNANCE.md';
    const content = ['# Protocol Governance', '', 'Lightweight governance output for tests.'].join('\n');
    await fs.outputFile(outputPath, content, 'utf8');
    console.log('GOVERNANCE.md generated');
    return { size: content.length, path: outputPath };
  } catch (error) {
    console.error(`Governance generation failed: ${error.message}`);
    process.exitCode = 1;
    return null;
  }
}

module.exports = { governanceCommand };

