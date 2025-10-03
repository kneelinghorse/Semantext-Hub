/**
 * Jest configuration for Protocol-Driven Discovery.
 * Restricts discovery to the app/tests directory and runs in a Node environment.
 */
export default {
  roots: ['<rootDir>/tests'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  verbose: false,
  transform: {},
  moduleNameMapper: {
    '^ora$': '<rootDir>/tests/__mocks__/ora.js',
    '^chalk$': '<rootDir>/tests/__mocks__/chalk.js'
  }
};
