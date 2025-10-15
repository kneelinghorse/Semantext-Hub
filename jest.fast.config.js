import baseConfig from './jest.config.js';

const FAST_TEST_GLOBS = [
  '<rootDir>/tests/cli/**/*.test.[tj]s',
  '<rootDir>/tests/cli/**/*.spec.[tj]s',
  '<rootDir>/tests/catalog/**/*.test.[tj]s',
  '<rootDir>/tests/catalog/**/*.spec.[tj]s',
  '<rootDir>/tests/feedback/**/*.test.[tj]s',
  '<rootDir>/tests/feedback/**/*.spec.[tj]s',
  '<rootDir>/tests/graph/**/*.test.[tj]s',
  '<rootDir>/tests/graph/**/*.spec.[tj]s',
  '<rootDir>/tests/security/**/*.test.[tj]s',
  '<rootDir>/tests/security/**/*.spec.[tj]s',
  '<rootDir>/tests/util/**/*.test.[tj]s',
  '<rootDir>/tests/util/**/*.spec.[tj]s',
  '<rootDir>/tests/openapi/**/*.test.[tj]s',
  '<rootDir>/tests/openapi/**/*.spec.[tj]s',
  '<rootDir>/tests/asyncapi/**/*.test.[tj]s',
  '<rootDir>/tests/asyncapi/**/*.spec.[tj]s',
  '<rootDir>/tests/manifest/**/*.test.[tj]s',
  '<rootDir>/tests/manifest/**/*.spec.[tj]s'
];

export default {
  ...baseConfig,
  testMatch: FAST_TEST_GLOBS,
  collectCoverage: false,
  coverageDirectory: 'coverage-fast'
};
