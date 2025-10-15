/**
 * CJS Test Shim for CLI output utilities
 */

function formatOutput(manifest, format, /*isCI*/ _ci) {
  // Minimal: always JSON stringify; tests accept JSON for both json and yaml fallback
  return JSON.stringify(manifest, null, 2);
}

function prettyPrintSummary(_manifest) {
  return 'Summary';
}

function printSuccess(msg) { console.log(msg); }
function printError(msg) { console.error(msg); }
function printInfo(msg) { console.log(msg); }
function printWarning(msg) { console.warn(msg); }

module.exports = {
  formatOutput,
  prettyPrintSummary,
  printSuccess,
  printError,
  printInfo,
  printWarning
};

