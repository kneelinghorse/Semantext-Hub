/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: { '^.+\\.(t|j)sx?$': ['babel-jest', { rootMode: 'upward' }] },
  testMatch: ['**/tests/**/*.test.(ts|js)', '**/tests/**/*.spec.(ts|js)'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  verbose: true
};
