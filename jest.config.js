/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  // Treat TS as ESM; keep .js as CJS for broad compatibility in tests
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  // Use babel-jest for TS/JS to interop ESM/CJS cleanly
  transform: { '^.+\.(t|j)sx?$': ['babel-jest', { rootMode: 'upward' }] },
  testMatch: [
    '**/tests/**/*.test.(ts|js|mjs)',
    '**/tests/**/*.spec.(ts|js|mjs)'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/artifacts/',
    '/\\.artifacts/',
    '/coverage/',
    '/cmos/'
  ],
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/artifacts/**',
    '!**/.artifacts/**',
    '!**/cmos/**',
    '!**/tests/**',
    '!**/scripts/**',
    '!**/bin/**',
    '!**/examples/**',
    '!**/templates/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testTimeout: 30000,
  maxWorkers: 2,
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  }
};
