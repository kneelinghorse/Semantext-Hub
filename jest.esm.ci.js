/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: {
    '^.+\\.(mjs|cjs|ts|tsx|js|jsx)$': ['babel-jest', { rootMode: 'upward' }]
  },
  testMatch: ['**/tests/**/*.test.(ts|js|mjs)', '**/tests/**/*.spec.(ts|js|mjs)'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.cjs'],
  verbose: true
};
