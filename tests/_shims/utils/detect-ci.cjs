/**
 * CJS Test Shim for CI detection
 */

function isCI() {
  return !!process.env.CI;
}

module.exports = { isCI };

