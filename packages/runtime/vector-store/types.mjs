export const VECTOR_STORE_DRIVERS = Object.freeze({
  LANCEDB: 'lancedb',
  QDRANT: 'qdrant'
});

export function normaliseDriver(driver) {
  const value = typeof driver === 'string' ? driver.trim().toLowerCase() : '';
  if (value === VECTOR_STORE_DRIVERS.QDRANT) {
    return VECTOR_STORE_DRIVERS.QDRANT;
  }
  return VECTOR_STORE_DRIVERS.LANCEDB;
}

/**
 * @typedef {Object} VectorPayload
 * @property {string|null|undefined} [tool_id]
 * @property {string|null|undefined} [urn]
 * @property {string|null|undefined} [name]
 * @property {string|null|undefined} [summary]
 * @property {string[]|undefined} [tags]
 * @property {string[]|undefined} [capabilities]
 * @property {Record<string, any>} [metadata]
 */

/**
 * @typedef {Object} VectorRecord
 * @property {Array<number>|Float32Array|Float64Array|Int32Array|Uint8Array} vector
 * @property {VectorPayload} payload
 */

/**
 * @typedef {Object} VectorSearchOptions
 * @property {number} [limit]
 * @property {number} [maxLimit]
 * @property {boolean} [includeVectors]
 * @property {any} [filter]
 */

/**
 * @typedef {Object} VectorSearchResult
 * @property {VectorPayload} payload
 * @property {Array<number>|undefined} [vector]
 * @property {number|null|undefined} [score]
 */

/**
 * @typedef {Object} IVectorStore
 * @property {(collectionName?: string) => Promise<void>} initialize
 * @property {(records: VectorRecord[]) => Promise<void>} upsert
 * @property {(ids: Array<string|number>) => Promise<void>} delete
 * @property {(vector: Array<number>|Float32Array, options?: VectorSearchOptions) => Promise<VectorSearchResult[]>} search
 * @property {() => Promise<void>=} flush
 * @property {() => Promise<void>=} close
 */

export function isVectorStore(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }
  return (
    typeof candidate.initialize === 'function' &&
    typeof candidate.upsert === 'function' &&
    typeof candidate.delete === 'function' &&
    typeof candidate.search === 'function'
  );
}

export default {
  VECTOR_STORE_DRIVERS,
  normaliseDriver,
  isVectorStore
};
