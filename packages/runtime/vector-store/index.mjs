import { LanceDBAdapter } from '../registry-loader/lancedb-adapter.mjs';

import { QdrantAdapter } from './qdrant-adapter.mjs';
import { VECTOR_STORE_DRIVERS, normaliseDriver } from './types.mjs';

export function createVectorStoreAdapter(config = {}) {
  const driver = normaliseDriver(config.driver);
  const vectorOptions = config.vectorOptions ?? {};
  const commonOptions = {
    collectionName: config.collectionName,
    logger: config.logger,
    workspace: config.workspace
  };

  if (driver === VECTOR_STORE_DRIVERS.QDRANT) {
    return new QdrantAdapter({
      ...commonOptions,
      ...vectorOptions
    });
  }

  return new LanceDBAdapter({
    ...commonOptions,
    dbPath: config.dbPath ?? config.lancedbPath,
    ...vectorOptions
  });
}

export { LanceDBAdapter } from '../registry-loader/lancedb-adapter.mjs';
export { QdrantAdapter } from './qdrant-adapter.mjs';
export { VECTOR_STORE_DRIVERS, normaliseDriver } from './types.mjs';
