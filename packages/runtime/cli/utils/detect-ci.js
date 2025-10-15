/**
 * CI Environment Detection
 *
 * Detects if running in a CI environment to adjust output formatting.
 * Returns true for common CI platforms.
 */

/**
 * Detects if the current process is running in a CI environment
 * @returns {boolean} True if running in CI
 */
export function isCI() {
  return !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.JENKINS_URL ||
    process.env.CIRCLECI ||
    process.env.TRAVIS ||
    process.env.BUILDKITE
  );
}
