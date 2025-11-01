# Vector Store Adapter Architecture

The Semantext Hub runtime uses a pluggable `IVectorStore` interface to abstract vector indexing and search. Both the existing `LanceDBAdapter` and the new `QdrantAdapter` implement the same contract: `initialize(collectionName?)`, `upsert(records)`, `search(queryVector, options)`, and `delete(ids)`, with optional `flush()`/`close()` hooks. Retrieval code inside the registry loader and Tool Hub search service now resolves adapters through `createVectorStoreAdapter`, making the choice of backing store a configuration detail rather than a code change.

## Drivers

- **LanceDB (`lancedb`)** — default local-first driver. Writes to `data/lancedb/<collection>` and falls back to JSON when the native module is unavailable.
- **Qdrant (`qdrant`)** — remote-ready driver that speaks to the Qdrant HTTP API. It ensures the collection schema, supports upsert/search/delete, and falls back to an on-disk JSON cache if the cluster is unreachable.

Both adapters share core utilities for payload normalisation and cosine similarity scoring. Contract tests in `tests/runtime/vector-store/adapter-contract.spec.mjs` exercise the shared behaviours against both drivers.

## Configuration

- `SEMANTEXT_VECTOR_DRIVER` or `--vector-driver` selects the driver (`lancedb` by default).
- `SEMANTEXT_QDRANT_URL` / `--qdrant-url` and `SEMANTEXT_QDRANT_API_KEY` / `--qdrant-api-key` supply remote connection details when the Qdrant driver is active.
- `SEMANTEXT_VECTOR_DIMENSION` and `SEMANTEXT_QDRANT_DISTANCE` (or corresponding options) customise the collection schema.

The registry loader and Tool Hub search service propagate these settings down to the adapter factory, keeping future migrations (Railway + Qdrant) configuration-driven.
