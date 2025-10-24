import baseConfig from './jest.config.js';

const instrumentationSetupPath =
  '<rootDir>/scripts/spikes/s21-sp1/jest-optimistic-instrumentation.cjs';

const projectsWithInstrumentation = baseConfig.projects.map((project) => {
  const setupFilesAfterEnv = project.setupFilesAfterEnv
    ? [...project.setupFilesAfterEnv, instrumentationSetupPath]
    : [instrumentationSetupPath];

  return {
    ...project,
    setupFilesAfterEnv
  };
});

export default {
  ...baseConfig,
  projects: projectsWithInstrumentation
};
