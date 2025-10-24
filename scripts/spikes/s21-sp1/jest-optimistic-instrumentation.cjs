/**
 * Jest setup file for S21.SP1 spike instrumentation.
 *
 * When S21_SP1_JEST_CONFLICT=1 is set, the registration optimistic-lock
 * compareAndSwap helper is instrumented to deterministically surface the
 * duplicate submit_for_review conflict observed in CI.
 */

if (process.env.S21_SP1_JEST_CONFLICT === '1') {
  const path = require('path');
  const optimisticModulePath = path.resolve(
    __dirname,
    '../../../packages/protocols/core/registration/optimistic-lock.js'
  );

  const optimistic = require(optimisticModulePath);

  if (!optimistic.__S21_SP1_PATCHED__) {
    const originalCompareAndSwap = optimistic.compareAndSwap;
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
      const stateForManifest = getManifestState(resourceId);
      stateForManifest.callCount += 1;
      const currentCall = stateForManifest.callCount;
      let readCountForCall = 0;

      if (process.env.S21_SP1_DEBUG_LOGS === '1') {
        console.log(
          `[S21.SP1] compareAndSwap call ${currentCall} for ${resourceId}`
        );
      }

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

        if (
          process.env.S21_SP1_DEBUG_LOGS === '1' &&
          resourceId === targetManifestId &&
          currentCall === 2 &&
          isRecheck
        ) {
          console.log(
            `[S21.SP1] delayed recheck read for ${resourceId} call ${currentCall}`
          );
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

    optimistic.__S21_SP1_PATCHED__ = true;
  }
}
