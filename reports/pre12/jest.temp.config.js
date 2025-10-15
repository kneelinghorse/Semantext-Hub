export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: { '^.+\\.(ts|tsx)$': ['babel-jest', { presets: [['@babel/preset-env',{targets:{node:'current'}}], '@babel/preset-typescript'] }] },
  testMatch: ['<rootDir>/tests/_probe/esm.sample.test.ts']
};
