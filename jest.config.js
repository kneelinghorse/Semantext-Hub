/**
 * Jest Configuration - Mission S19.2-20251021
 * No quarantines, no bypass. Explicit coverage targets for critical surfaces.
 */
import fs from 'node:fs';
import { asJestCoverageThreshold } from './config/coverage-thresholds.mjs';

const BASE_IGNORE_PATTERNS = [
  '/node_modules/',
  '/artifacts/',
  '/\\.artifacts/',
  '/coverage/',
  '/cmos/',
  'cli/commands/dist/',
];

const COVERAGE_TARGETS = [
  // Mission GTC.1: broaden coverage to all critical runtime + CLI paths
  '<rootDir>/app/cli/**/*.{js,mjs,cjs}',
  '<rootDir>/app/services/**/*.{js,mjs,cjs}',
  '<rootDir>/app/adapters/**/*.{js,mjs,cjs}',
  '<rootDir>/app/importers/**/*.{js,mjs,cjs}',
  '<rootDir>/packages/runtime/cli/**/*.{js,mjs,cjs}',
  '<rootDir>/packages/runtime/services/**/*.{js,mjs,cjs}',
  '<rootDir>/packages/runtime/runtime/**/*.{js,mjs,cjs}',
  '<rootDir>/packages/runtime/workflow/**/*.{js,mjs,cjs}',
  '<rootDir>/packages/runtime/importers/**/*.{js,mjs,cjs}',
  '<rootDir>/packages/runtime/adapters/**/*.{js,mjs,cjs}',
  '<rootDir>/packages/runtime/viewer/routes/**/*.{js,mjs,cjs}',
  '<rootDir>/packages/runtime/registry/**/*.{js,mjs,cjs}',
  '<rootDir>/app/ui/authoring/**/*.{js,mjs,cjs}',
  '<rootDir>/app/libs/signing/**/*.{js,mjs,cjs}',
  '<rootDir>/tests/api/helpers/**/*.{js,mjs,cjs}',
];

const COVERAGE_EXCLUDES = [
  // Non production code paths + generated artifacts that should not count toward coverage
  '!**/*.d.ts',
  '!**/*.test.*',
  '!**/*.spec.*',
  '!**/__tests__/**',
  '!**/__mocks__/**',
  '!**/__fixtures__/**',
  '!**/__generated__/**',
  '!**/node_modules/**',
  '!**/coverage/**',
  '!**/artifacts/**',
  '!**/.artifacts/**',
  '!**/cmos/**',
  '!**/examples/**',
  '!**/templates/**',
  '!**/scripts/**',
  '!**/seeds/**',
  '!**/dist/**',
  '!**/build/**',
  // CLI entrypoints execute in child node processes; instrumentation does not capture them reliably
  '!<rootDir>/app/cli/**/*.{js,mjs,cjs}',
  '!<rootDir>/packages/runtime/cli/**/*.{js,mjs,cjs}',
  '!<rootDir>/packages/runtime/services/mcp-server/performance-optimizations.js',
  // Explicit exclusions for startup glue + pre-built web bundles
  '!<rootDir>/packages/runtime/registry/start.mjs',
  '!<rootDir>/app/ui/authoring/web/**',
];

const COVERAGE_PATH_IGNORE_PATTERNS = [
  'artifacts/scaffold-smoke/.+\\.test\\.(t|j)sx?$',
  'packages/.+/__fixtures__/.+',
];

const createProject = (overrides = {}) => {
  const {
    displayName,
    testMatch,
    testPathIgnorePatterns,
    ...rest
  } = overrides;

  return {
    displayName,
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts', '.tsx'],
    transform: {
      '^.+\\.(mjs|cjs|ts|tsx|js|jsx)$': ['babel-jest', { rootMode: 'upward' }],
    },
    testMatch,
    testPathIgnorePatterns: testPathIgnorePatterns ?? BASE_IGNORE_PATTERNS,
    setupFilesAfterEnv: ['<rootDir>/tests/setup.cjs'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'json', 'node'],
    moduleNameMapper: {
      '^@/(.*)$': '<rootDir>/$1',
    },
    maxWorkers: 2,
    ...rest,
  };
};

const shouldEnforceCoverageThresholds = () => {
  const isCoverageRequested = process.argv.some((arg) => {
    if (arg === '--coverage' || arg === '--collectCoverage') {
      return true;
    }
    if (arg.startsWith('--coverage=')) {
      return arg.split('=').at(1) !== 'false';
    }
    if (arg.startsWith('--collectCoverage=')) {
      return arg.split('=').at(1) !== 'false';
    }
    return false;
  });

  return isCoverageRequested;
};

const coreProject = createProject({
  displayName: 'core',
  testMatch: [
    '<rootDir>/tests/**/*.test.(ts|js|mjs)',
    '<rootDir>/tests/**/*.spec.(ts|js|mjs)',
  ],
  testPathIgnorePatterns: [
    ...BASE_IGNORE_PATTERNS,
    '<rootDir>/tests/catalog-cli/',
    '<rootDir>/tests/wsap-cli/',
  ],
});

const catalogCliProject = createProject({
  displayName: 'catalog-cli',
  testMatch: ['<rootDir>/tests/catalog-cli/**/*.(test|spec).(ts|js|mjs)'],
});

const wsapCliProject = createProject({
  displayName: 'wsap-cli',
  testMatch: ['<rootDir>/tests/wsap-cli/**/*.(test|spec).(ts|js|mjs)'],
});

export default {
  testTimeout: 30000,
  verbose: true,
  collectCoverageFrom: [...COVERAGE_TARGETS, ...COVERAGE_EXCLUDES],
  coveragePathIgnorePatterns: COVERAGE_PATH_IGNORE_PATTERNS,
  coverageReporters: ['json-summary', 'text', 'text-summary', 'lcov'],
  ...(shouldEnforceCoverageThresholds()
    ? {
        coverageThreshold: asJestCoverageThreshold(),
      }
    : {}),
  projects: [coreProject, catalogCliProject, wsapCliProject],
  watchPathIgnorePatterns: ['<rootDir>/artifacts/test/', '<rootDir>/coverage/'],
};
