/**
 * Optimistic Concurrency Control (OCC)
 *
 * Implements version-based optimistic locking for preventing concurrent write conflicts.
 * Uses compare-and-swap pattern: check version before write, increment on success.
 *
 * Pattern:
 * 1. Read state + version
 * 2. Compute new state
 * 3. Check version unchanged
 * 4. Write new state + incremented version
 * 5. If version changed → retry
 *
 * @module core/registration/optimistic-lock
 */

/**
 * Custom error for optimistic lock failures
 */
class OptimisticLockException extends Error {
  constructor(resourceId, expectedVersion, actualVersion) {
    super(`Optimistic lock failed for ${resourceId}: expected version ${expectedVersion}, found ${actualVersion}`);
    this.name = 'OptimisticLockException';
    this.resourceId = resourceId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
    this.retryable = true;
  }
}

/**
 * Exponential backoff configuration
 */
const DEFAULT_RETRY_CONFIG = {
  maxAttempts: 5,
  baseDelay: 10, // ms
  maxDelay: 1000, // ms
  jitterFactor: 0.5 // 50% jitter
};

/**
 * Calculate exponential backoff delay with jitter
 *
 * @param {number} attempt - Attempt number (0-indexed)
 * @param {Object} config - Retry configuration
 * @returns {number} Delay in milliseconds
 */
function calculateBackoff(attempt, config = DEFAULT_RETRY_CONFIG) {
  const { baseDelay, maxDelay, jitterFactor } = config;

  // Exponential: baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter: random value between (1 - jitter) and (1 + jitter)
  const jitter = 1 + (Math.random() * 2 - 1) * jitterFactor;
  const delayWithJitter = Math.floor(cappedDelay * jitter);

  return delayWithJitter;
}

/**
 * Sleep for a specified duration
 *
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 *
 * @param {Function} fn - Async function to retry
 * @param {Object} config - Retry configuration
 * @returns {Promise<*>} Result of fn
 * @throws {Error} If all retries fail
 */
async function retryWithBackoff(fn, config = DEFAULT_RETRY_CONFIG) {
  const mergedConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...config
  };
  const {
    maxAttempts,
    onRetry,
    onSuccess,
    onExhausted,
    resourceId
  } = mergedConfig;
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await fn(attempt);

      if (attempt > 0 && typeof onSuccess === 'function') {
        onSuccess({
          attempt,
          totalAttempts: attempt + 1,
          resourceId,
          result
        });
      }

      return result;
    } catch (error) {
      lastError = error;

      // Only retry on OptimisticLockException
      if (!(error instanceof OptimisticLockException) || !error.retryable) {
        throw error;
      }

      // Don't wait after final attempt
      if (attempt < maxAttempts - 1) {
        const delay = calculateBackoff(attempt, mergedConfig);

        if (typeof onRetry === 'function') {
          onRetry({
            attempt,
            resourceId,
            delay,
            maxAttempts,
            error
          });
        }

        await sleep(delay);
      }
    }
  }

  if (typeof onExhausted === 'function') {
    onExhausted({
      attempts: maxAttempts,
      resourceId,
      error: lastError
    });
  }

  // All attempts exhausted
  throw new Error(
    `Optimistic lock retry exhausted after ${maxAttempts} attempts. Last error: ${lastError.message}`
  );
}

/**
 * Create a versioned state object
 *
 * @param {Object} state - State data
 * @param {number} version - Version number (default: 1)
 * @returns {Object} Versioned state
 */
function createVersionedState(state, version = 1) {
  return {
    version,
    state,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Increment version of a versioned state object
 *
 * @param {Object} versionedState - Versioned state object
 * @returns {Object} New versioned state with incremented version
 */
function incrementVersion(versionedState) {
  return {
    ...versionedState,
    version: versionedState.version + 1,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Sentinel used when a transition was already applied by a concurrent writer.
 * compareAndSwap callers returning this value should short-circuit without writes.
 */
const ALREADY_APPLIED = Symbol('registration.optimistic_lock.already_applied');

/**
 * Validate version match for optimistic locking
 *
 * @param {Object} expected - Expected versioned state
 * @param {Object} actual - Actual versioned state (current)
 * @param {string} resourceId - Resource identifier for error messages
 * @throws {OptimisticLockException} If versions don't match
 */
function validateVersion(expected, actual, resourceId) {
  if (!expected || typeof expected.version !== 'number') {
    throw new Error('Expected state must have a numeric version');
  }

  if (!actual || typeof actual.version !== 'number') {
    throw new Error('Actual state must have a numeric version');
  }

  if (expected.version !== actual.version) {
    throw new OptimisticLockException(
      resourceId,
      expected.version,
      actual.version
    );
  }
}

/**
 * Compare-and-swap operation for optimistic locking
 *
 * @param {Function} readFn - Async function to read current state
 * @param {Function} writeFn - Async function to write new state
 * @param {Function} computeNewState - Function to compute new state from current
 * @param {string} resourceId - Resource identifier
 * @param {Object} retryConfig - Retry configuration
 * @returns {Promise<Object>} New versioned state after successful write
 */
async function compareAndSwap(readFn, writeFn, computeNewState, resourceId, retryConfig = DEFAULT_RETRY_CONFIG) {
  return retryWithBackoff(async (attempt) => {
    // Step 1: Read current state
    const currentVersionedState = await readFn();

    // Step 2: Compute new state
    const newState = await computeNewState(currentVersionedState.state, attempt);

    if (newState === ALREADY_APPLIED) {
      return currentVersionedState;
    }

    // Step 3: Re-read to check version
    const recheckVersionedState = await readFn();

    // Step 4: Validate version hasn't changed
    validateVersion(currentVersionedState, recheckVersionedState, resourceId);

    // Step 5: Increment version and write
    const newVersionedState = incrementVersion({
      ...recheckVersionedState,
      state: newState
    });

    await writeFn(newVersionedState);

    return newVersionedState;
  }, retryConfig);
}

module.exports = {
  OptimisticLockException,
  DEFAULT_RETRY_CONFIG,
  calculateBackoff,
  sleep,
  retryWithBackoff,
  createVersionedState,
  incrementVersion,
  ALREADY_APPLIED,
  validateVersion,
  compareAndSwap
};
