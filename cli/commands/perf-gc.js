#!/usr/bin/env node

/**
 * Performance artifact garbage-collection command.
 *
 * Wraps scripts/cleanup/gc-artifacts.mjs for CLI usage so operators can enforce
 * retention policies without navigating to the scripts directory.
 */

import { runRetentionGc, logSummary } from '../../scripts/cleanup/gc-artifacts.mjs';

/**
 * Execute garbage-collection according to retention policies.
 *
 * @param {Object} options
 * @param {string} options.workspace - Workspace root.
 * @param {boolean} [options.dryRun=false] - When true, preview changes without deletions.
 * @param {boolean} [options.json=false] - Emit JSON summary instead of human-readable logs.
 * @returns {Promise<Object>} Summary of retention activity.
 */
export async function perfGcCommand({ workspace, dryRun = false, json = false } = {}) {
  const summary = await runRetentionGc({
    workspace,
    dryRun
  });

  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  }

  logSummary(summary);
  return summary;
}
