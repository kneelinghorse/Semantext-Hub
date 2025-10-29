/**
 * Shared coverage threshold configuration.
 * Global thresholds guard overall health, and the critical path thresholds
 * ensure high-signal surfaces remain well exercised.
 */
export const globalCoverageThreshold = {
  branches: 60,
  functions: 70,
  lines: 70,
  statements: 70,
};

export const criticalPathCoverageThresholds = {
  'packages/runtime/viewer/routes/api.mjs': {
    lines: 85,
    functions: 80,
    branches: 75,
    statements: 85,
  },
  'packages/runtime/registry/server.mjs': {
    lines: 85,
    functions: 80,
    branches: 75,
    statements: 85,
  },
  'app/ui/authoring/server.mjs': {
    lines: 80,
    functions: 75,
    branches: 55,
    statements: 80,
  },
};

export const coverageThresholdConfig = {
  global: globalCoverageThreshold,
  files: criticalPathCoverageThresholds,
};

export const asJestCoverageThreshold = () => ({
  global: globalCoverageThreshold,
  ...Object.fromEntries(
    Object.entries(criticalPathCoverageThresholds).map(([relativePath, thresholds]) => [
      `./${relativePath}`,
      thresholds,
    ]),
  ),
});

