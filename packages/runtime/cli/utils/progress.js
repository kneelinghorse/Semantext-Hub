/**
 * Progress Indicators
 *
 * Provides progress indication for long-running operations (>2s).
 * Automatically disables in CI environments.
 */

import ora from 'ora';
import { isCI } from './detect-ci.js';

/**
 * Creates a spinner for long-running operations
 * Automatically disabled in CI environments
 *
 * @param {string} message - Initial message to display
 * @returns {Object} Spinner instance with start/stop/succeed/fail methods
 */
export function createSpinner(message) {
  if (isCI()) {
    // In CI, just log messages without spinner animation
    const noopSpinner = {
      text: message,
      start() {
        console.log(message);
        return this;
      },
      succeed(msg) {
        console.log(`✓ ${msg || this.text}`);
      },
      fail(msg) {
        console.error(`✗ ${msg || this.text}`);
      },
      warn(msg) {
        console.warn(`⚠ ${msg || this.text}`);
      },
      info(msg) {
        console.log(`ℹ ${msg || this.text}`);
      },
      stop() {
        /* no-op in CI */
      }
    };

    return noopSpinner;
  }

  return ora(message);
}
