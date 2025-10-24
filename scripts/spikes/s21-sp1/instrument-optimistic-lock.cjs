/**
 * Instrumentation shim for S21.SP1 spike.
 *
 * Injects deterministic contention into compareAndSwap to reproduce
 * the optimistic-lock failure observed in guardrail tests.
 *
 * Usage:
 *   NODE_OPTIONS="--require ./scripts/spikes/s21-sp1/instrument-optimistic-lock.cjs" \
 *   S21_SP1_TEST_MODE=induce_conflict \
 *   npm test -- tests/registration/concurrency.test.js
 *
 * The shim introduces a controlled ordering where the second concurrent call
 * observes the state after the first write during the recheck phase, forcing
 * an OptimisticLockException followed by a semantic rejection on retry.
 */

const path = require('path');
const optimisticModulePath = path.resolve(
  __dirname,
  '../../../packages/protocols/core/registration/optimistic-lock.js'
);

// Ensure we only patch once per process
if (!global.__S21_SP1_OPTIMISTIC_PATCHED__) {
  const optimistic = require(optimisticModulePath);
  const originalCompareAndSwap = optimistic.compareAndSwap;

  // Simple barrier primitive for orchestrating write/read order
  const createBarrier = () => {
    let resolveBarrier;
    const promise = new Promise((resolve) => {
      resolveBarrier = resolve;
    });
    return {
      promise,
      resolve: () => resolveBarrier && resolveBarrier()
    };
  };

  const manifestState = new Map();
  const targetManifestId =
    process.env.S21_SP1_TARGET_MANIFEST || 'concurrent-002';

  const getManifestState = (resourceId) => {
    if (!manifestState.has(resourceId)) {
      manifestState.set(resourceId, {
        callCount: 0,
        barrier: createBarrier(),
        firstWriteCommitted: false
      });
    }
    return manifestState.get(resourceId);
  };

  optimistic.compareAndSwap = async function patchedCompareAndSwap(
    readFn,
    writeFn,
    computeNewState,
    resourceId,
    retryConfig
  ) {
    // When not in spike mode, just delegate.
    if (process.env.S21_SP1_TEST_MODE !== 'induce_conflict') {
      return originalCompareAndSwap(
        readFn,
        writeFn,
        computeNewState,
        resourceId,
        retryConfig
      );
    }

    const stateForManifest = getManifestState(resourceId);
    stateForManifest.callCount += 1;
    const currentCall = stateForManifest.callCount;
    if (process.env.S21_SP1_DEBUG_LOGS === '1') {
      console.log(
        `[S21.SP1] compareAndSwap call ${currentCall} for ${resourceId}`
      );
    }
    let readCountForCall = 0;

    const wrappedRead = async () => {
      readCountForCall += 1;
      const isRecheck = readCountForCall === 2;

      if (
        resourceId === targetManifestId &&
        currentCall === 2 &&
        isRecheck &&
        !stateForManifest.firstWriteCommitted
      ) {
        await stateForManifest.barrier.promise;
      }

      return readFn();
    };

    const wrappedWrite = async (newVersionedState) => {
      const result = await writeFn(newVersionedState);

      if (
        resourceId === targetManifestId &&
        currentCall === 1 &&
        !stateForManifest.firstWriteCommitted
      ) {
        stateForManifest.firstWriteCommitted = true;
        stateForManifest.barrier.resolve();
        if (process.env.S21_SP1_DEBUG_LOGS === '1') {
          console.log(
            `[S21.SP1] first write committed for ${resourceId}; resuming blocked readers`
          );
        }
      }

      return result;
    };

    return originalCompareAndSwap(
      wrappedRead,
      wrappedWrite,
      computeNewState,
      resourceId,
      retryConfig
    );
  };

  global.__S21_SP1_OPTIMISTIC_PATCHED__ = true;
}
