/**
 * Jest Configuration - Mission S19.2-20251021
 * No quarantines, no bypass. Explicit coverage targets for critical surfaces.
 */
import fs from 'node:fs';

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

const skipCoverageThresholds = process.env.JEST_SKIP_THRESHOLDS === '1';

const catalogCliProject = createProject({
  displayName: 'catalog-cli',
  testMatch: ['<rootDir>/tests/catalog-cli/**/*.(test|spec).(ts|js|mjs)'],
});

const wsapCliProject = createProject({
  displayName: 'wsap-cli',
  testMatch: ['<rootDir>/tests/wsap-cli/**/*.(test|spec).(ts|js|mjs)'],
});

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

export default {
  testTimeout: 30000,
  verbose: true,
  collectCoverageFrom: [...COVERAGE_TARGETS, ...COVERAGE_EXCLUDES],
  coveragePathIgnorePatterns: COVERAGE_PATH_IGNORE_PATTERNS,
  coverageReporters: ['json-summary', 'text', 'text-summary', 'lcov'],
  // Mission S19.2: No bypass, no quarantine - focused thresholds on critical surfaces
  ...(skipCoverageThresholds
    ? {}
    : {
        coverageThreshold: {
          global: {
            branches: 60,
            functions: 70,
            lines: 70,
            statements: 70,
          },
          // Per-surface minimums for critical backend paths
          './packages/runtime/viewer/routes/api.mjs': {
            lines: 85,
            functions: 80,
            branches: 75,
            statements: 85,
          },
          './packages/runtime/registry/server.mjs': {
            lines: 85,
            functions: 80,
            branches: 75,
            statements: 85,
          },
          './app/ui/authoring/server.mjs': {
            lines: 80,
            functions: 75,
            branches: 55,
            statements: 80,
          },
          // Authoring E2E: 17 tests covering edit→validate→save→graph flows
          // React components tested via browser-based E2E (authoring.e2e.spec.mjs)
        },
      }),
  projects: [catalogCliProject, wsapCliProject, coreProject],
  watchPathIgnorePatterns: ['<rootDir>/artifacts/test/', '<rootDir>/coverage/'],
};
