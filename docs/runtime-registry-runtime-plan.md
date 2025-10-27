# Runtime Registry Server - Configuration & Architecture

**Mission:** IM-01A-20251101  
**Status:** Delivered  
**Package:** `packages/runtime/registry`

## Overview

The runtime registry server provides a canonical, production-ready HTTP API for agent manifest registration, resolution, and capability-based discovery. It replaces the legacy file-based registry (`app/services/registry`) with a SQLite-backed implementation that supports:

- **Durable storage** via SQLite with WAL (Write-Ahead Logging) mode
- **Capability projection** for efficient querying
- **Provenance attestation** with DSSE envelope validation
- **Rate limiting** per-endpoint
- **API key authentication**
- **OpenAPI specification** served at `/openapi.json`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Runtime Registry Server                   │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Express    │──│  Repository  │──│  SQLite DB       │  │
│  │   Routes     │  │  Layer       │  │  (WAL mode)      │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         │                                                     │
│         ├─ /health                                           │
│         ├─ /openapi.json                                     │
│         ├─ /.well-known/ossp-agi.json                        │
│         ├─ /v1/registry/:urn (PUT, GET)                      │
│         ├─ /v1/resolve?urn=...                               │
│         └─ /v1/query (POST)                                  │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Rate Limiter │  │ Provenance   │  │  API Key Auth    │  │
│  │ (express-    │  │ Validator    │  │  (X-API-Key)     │  │
│  │  rate-limit) │  │ (DSSE/Ed25519│  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

The registry uses three primary tables:

### `manifests`
Stores agent manifests and their metadata.

| Column       | Type | Description                              |
|--------------|------|------------------------------------------|
| `urn`        | TEXT | Primary key, unique agent identifier     |
| `body`       | TEXT | JSON-serialized manifest                 |
| `digest`     | TEXT | SHA-256 hash of body                     |
| `issuer`     | TEXT | Optional issuer/signer identifier        |
| `signature`  | TEXT | Optional JWS/DSSE signature envelope     |
| `created_at` | TEXT | ISO 8601 timestamp of initial insert     |
| `updated_at` | TEXT | ISO 8601 timestamp of last update        |

### `capabilities`
Projection of `capabilities` array from manifests for efficient querying.

| Column | Type | Description                        |
|--------|------|------------------------------------|
| `urn`  | TEXT | Foreign key to `manifests.urn`     |
| `cap`  | TEXT | Capability identifier              |

Primary key: `(urn, cap)`  
Index: `idx_cap` on `cap` for fast lookups

### `provenance`
DSSE provenance attestations (SLSA-style).

| Column         | Type | Description                                |
|----------------|------|--------------------------------------------|
| `urn`          | TEXT | Foreign key to `manifests.urn`             |
| `envelope`     | TEXT | JSON-serialized DSSE envelope              |
| `payload_type` | TEXT | e.g., `application/vnd.in-toto+json`       |
| `digest`       | TEXT | SHA-256 of attested manifest               |
| `issuer`       | TEXT | Builder/signer identifier                  |
| `committed_at` | TEXT | Git commit timestamp                       |
| `build_tool`   | TEXT | Tool that created the build                |
| `inputs`       | TEXT | JSON array of input artifacts              |
| `outputs`      | TEXT | JSON array of output artifacts             |
| `created_at`   | TEXT | Timestamp of provenance record insertion   |

Primary key: `(urn, digest)`  
Indexes: `idx_prov_urn`, `idx_prov_issuer`, `idx_prov_committed_at`

## API Factory: `createServer(options)`

**Module:** `packages/runtime/registry/server.mjs`

```javascript
import { createServer } from './packages/runtime/registry/server.mjs';

const app = await createServer({
  // Required
  apiKey: 'your-secret-api-key',

  // Optional configuration paths
  registryConfigPath: './config/registry.config.json',
  rateLimitConfigPath: './config/security/rate-limit.config.json',

  // Provenance verification
  requireProvenance: true, // default: true
  provenanceKeyPath: './keys/pub.pem', // Path to Ed25519 public key
  provenanceKeys: [ // Alternative: provide keys directly
    {
      pubkey: '-----BEGIN PUBLIC KEY-----\n...',
      alg: 'Ed25519',
      keyid: 'key-123',
    },
  ],
  provenanceAlgorithm: 'Ed25519', // default
  provenanceKeyId: null,

  // Other options
  jsonLimit: '512kb', // Max request body size
});

// app is a standard Express instance
app.listen(3000);
```

### Configuration Options

#### Required

- **`apiKey`** (string): API key for X-API-Key header authentication. Can also be set via `REGISTRY_API_KEY` environment variable.

#### Optional

- **`registryConfigPath`** (string | null): Path to registry configuration JSON. Defaults to `app/config/registry.config.json`. Set to `null` to skip loading.
  
  Example `registry.config.json`:
  ```json
  {
    "dbPath": "./var/registry.sqlite",
    "pragmas": {
      "busy_timeout": 5000
    }
  }
  ```

- **`rateLimitConfigPath`** (string | null): Path to rate-limit configuration JSON. Defaults to `app/config/security/rate-limit.config.json`. Set to `null` to disable rate limiting.

  Example `rate-limit.config.json`:
  ```json
  {
    "windowMs": 60000,
    "max": 100,
    "standardHeaders": true,
    "legacyHeaders": false,
    "message": {
      "error": "rate_limited",
      "message": "Too many requests."
    }
  }
  ```

- **`requireProvenance`** (boolean): Whether to require DSSE provenance attestations on all manifest registrations. Defaults to `true`. Set to `false` for development/testing.

- **`provenanceKeyPath`** (string): Path to Ed25519 public key PEM file for provenance signature verification. Defaults to `fixtures/keys/pub.pem`.

- **`provenanceKeys`** (array): Array of key configuration objects (alternative to `provenanceKeyPath`). Each object must have:
  - `pubkey` (string): PEM-encoded public key
  - `alg` (string): Algorithm, e.g., `'Ed25519'`
  - `keyid` (string | null): Optional key ID for multi-key scenarios

- **`provenanceAlgorithm`** (string): Signature algorithm. Defaults to `'Ed25519'`.

- **`provenanceKeyId`** (string | null): Expected key ID for signature verification.

- **`jsonLimit`** (string): Maximum JSON request body size. Defaults to `'512kb'`.

### Returns

Returns an Express application instance with:

- `app.get('db')`: SQLite database connection
- `app.get('provenanceVerifier')`: Array of provenance verification key configs
- `app.get('provenanceRequired')`: Boolean indicating whether provenance is enforced

## Start Helper: `startServer(options)`

Convenience wrapper that creates and starts the server in one call.

```javascript
import { startServer } from './packages/runtime/registry/server.mjs';

const { app, port, server, close } = await startServer({
  port: 3000,
  apiKey: 'your-api-key',
  // ... other createServer options
});

console.log(`Server running on port ${port}`);

// Graceful shutdown
await close();
```

### Options

Accepts all options from `createServer()` plus:

- **`port`** (number): Port to listen on. Defaults to `3000`.

### Returns

Object with:

- **`app`**: Express application instance
- **`port`**: Port the server is listening on
- **`server`**: Node.js HTTP server instance
- **`close()`**: Async function to gracefully close the server

## API Endpoints

### Public Endpoints

#### `GET /.well-known/ossp-agi.json`

Service discovery metadata.

**Response:**
```json
{
  "service": "OSSP-AGI Registry Service (SQLite)",
  "version": "registry.ossp-agi.io/v1",
  "description": "SQLite-backed registry with WAL mode for durability",
  "links": {
    "register_v1": "/v1/registry/{urn}",
    "resolve_v1": "/v1/resolve?urn={urn}",
    "query_v1": "/v1/query",
    "health": "/health"
  },
  "auth": {
    "type": "api-key",
    "header": "X-API-Key"
  }
}
```

#### `GET /health`

Health check endpoint (no authentication required).

**Response:**
```json
{
  "status": "ok",
  "registry": {
    "driver": "sqlite",
    "wal": true,
    "schema_version": 1,
    "records": 42
  },
  "rateLimit": {
    "windowMs": 60000,
    "max": 100
  }
}
```

#### `GET /openapi.json`

Serves the OpenAPI 3.0 specification from disk (`packages/runtime/registry/openapi.json`).

**Response:** OpenAPI specification JSON

### Authenticated Endpoints

All `/v1/*` endpoints require:
- **Header:** `X-API-Key: <your-api-key>`
- **Rate limiting** (configured via `rateLimitConfigPath`)

#### `PUT /v1/registry/:urn`

Register or update an agent manifest.

**Request:**
```json
{
  "manifest": {
    "id": "example-agent",
    "version": "1.0.0",
    "capabilities": ["service.example", "tool.foo"],
    "metadata": { "author": "Example Corp" }
  },
  "provenance": {
    "payloadType": "application/vnd.in-toto+json",
    "payload": "base64-encoded-payload",
    "signatures": [{ "keyid": "key-id", "sig": "signature" }]
  },
  "issuer": "optional-issuer-id",
  "signature": "optional-jws-signature"
}
```

**Response:**
```json
{
  "status": "ok",
  "urn": "urn:agent:example:example-agent@1.0.0",
  "digest": "abc123...",
  "provenance": {
    "builder": "https://github.com/...",
    "signature": "..."
  }
}
```

**Error Responses:**
- `400`: Invalid request (missing manifest, invalid JSON)
- `401`: Unauthorized (missing/invalid API key)
- `422`: Validation error (missing provenance, invalid provenance signature)
- `500`: Internal error (provenance verification keys not loaded)

#### `GET /v1/registry/:urn`

Fetch a manifest by URN.

**Response:**
```json
{
  "urn": "urn:agent:example:example-agent@1.0.0",
  "body": { "id": "example-agent", ... },
  "digest": "abc123...",
  "issuer": null,
  "signature": null,
  "updated_at": "2025-01-01T12:00:00Z",
  "provenance": {
    "builder": "https://github.com/...",
    "committedAt": "2025-01-01T11:00:00Z",
    "issuer": "builder-id",
    "digest": "abc123...",
    "recordedAt": "2025-01-01T12:00:00Z"
  }
}
```

**Error Responses:**
- `401`: Unauthorized
- `404`: Manifest not found

#### `GET /v1/resolve?urn=<urn>`

Resolve an agent, returning manifest and capabilities.

**Response:**
```json
{
  "urn": "urn:agent:example:example-agent@1.0.0",
  "manifest": { "id": "example-agent", ... },
  "capabilities": ["service.example", "tool.foo"],
  "digest": "abc123..."
}
```

**Error Responses:**
- `400`: Invalid query (missing `urn` parameter)
- `401`: Unauthorized
- `404`: Not found

#### `POST /v1/query`

Query agents by capability.

**Request:**
```json
{
  "capability": "service.example"
}
```

**Response:**
```json
{
  "status": "ok",
  "capability": "service.example",
  "results": [
    { "urn": "urn:agent:example:example-agent@1.0.0", "digest": "abc123..." },
    { "urn": "urn:agent:another:agent@2.0.0", "digest": "def456..." }
  ]
}
```

**Error Responses:**
- `400`: Invalid request (missing `capability`)
- `401`: Unauthorized

## Repository Layer

**Module:** `packages/runtime/registry/repository.mjs`

The repository layer provides SQLite-only CRUD operations. All functions are async and accept a `db` instance as the first parameter.

### `upsertManifest(db, urn, body, options)`

Insert or update a manifest.

**Parameters:**
- `db`: SQLite database instance
- `urn` (string): Agent URN
- `body` (object | string): Manifest object or JSON string
- `options` (object):
  - `issuer` (string): Optional issuer
  - `signature` (string): Optional signature
  - `provenance` (object): Optional DSSE provenance envelope

**Returns:** `{ urn, digest }`

**Side Effects:**
- Inserts/updates row in `manifests`
- Extracts `capabilities` array and populates `capabilities` table
- If `provenance` provided, inserts into `provenance` table

### `getManifest(db, urn)`

Fetch a manifest by URN.

**Returns:** Object with `urn`, `body`, `digest`, `issuer`, `signature`, `updated_at`, and `provenance` (if available).

### `resolve(db, urn)`

Resolve an agent, returning manifest and capabilities.

**Returns:** Object with `urn`, `manifest`, `capabilities` (array), and `digest`.

### `queryByCapability(db, capability)`

Find all agents with a specific capability.

**Returns:** Array of `{ urn, digest }` objects.

### `insertProvenance(db, urn, digest, envelope)`

Insert a provenance record.

**Parameters:**
- `envelope` (object | string): DSSE envelope

Parses the envelope, extracts metadata (issuer, build tool, inputs, outputs), and inserts into `provenance` table.

### `getProvenance(db, urn)`

Fetch all provenance records for a URN.

**Returns:** Array of provenance summaries.

### `listManifests(db)`

List all manifests.

**Returns:** Array of `{ urn, digest, updated_at }` objects.

## Database Connection

**Module:** `packages/runtime/registry/db.mjs`

### `openDb(config)`

Opens a SQLite database connection with WAL mode enabled.

**Parameters:**
- `config` (object):
  - `dbPath` (string): Path to SQLite database file. Defaults to `var/registry.sqlite`.
  - `pragmas` (object): Optional custom PRAGMA settings

**Returns:** Promise resolving to `db` instance (from `sqlite` package)

**Automatic PRAGMAs:**
- `journal_mode=WAL`
- `synchronous=NORMAL`

### `getHealth(db)`

Returns database health metadata.

**Returns:** Object with registry health metrics:
- `driver` – storage backend identifier (`sqlite`).
- `wal` – boolean indicating whether WAL mode is active.
- `journalMode` – SQLite journal_mode string.
- `schemaVersion` / `expectedSchemaVersion` – current vs. expected schema.
- `disk` – optional `{ path, freeBytes, freeMegabytes, thresholdBytes, healthy }`.
- `warnings` / `errors` – arrays capturing degradations or critical failures.
- `status` – derived summary (`ok`, `warn`, `critical`).

## OpenAPI Specification Equality

The runtime server serves the OpenAPI spec from disk at `/openapi.json`. The parity test harness (`tests/runtime/registry.http.parity.spec.mjs`) validates that:

1. The spec is served correctly
2. It matches the on-disk version at `packages/runtime/registry/openapi.json` (normalized comparison with sorted keys)

This ensures the API contract is versioned and changes are tracked explicitly.

## Migration Strategy

### Phase 1: Runtime Server Hardening (✅ Complete)
- ✅ `createServer()` and `startServer()` factories
- ✅ Config loading (registry, rate-limit, provenance keys)
- ✅ Repository layer (SQLite-only)
- ✅ Provenance insertion and retrieval
- ✅ OpenAPI spec endpoint
- ✅ Parity test harness

### Phase 2: Consumer Migration (Planned)
- Update CLI commands to use runtime server
- Migrate A2A discovery to query runtime registry
- Update CI/CD to deploy runtime server

### Phase 3: Legacy Deprecation (Future)
- Deprecate `app/services/registry`
- Remove file-based storage
- Consolidate on SQLite runtime stack

## Testing

Run the parity test harness:

```bash
npm run test -- --runTestsByPath tests/runtime/registry.http.parity.spec.mjs
```

The test suite validates:

- `/health` endpoint correctness
- OpenAPI spec equality
- Manifest registration and retrieval
- Capability projection
- Provenance insertion and summarization
- Query endpoint functionality
- API key authentication
- Rate limiting
- CORS handling
- Error handling

## Security Considerations

1. **API Key Authentication**: All `/v1/*` endpoints require `X-API-Key` header. Keys should be rotated regularly and stored securely.

2. **Provenance Verification**: When `requireProvenance: true`, all manifest registrations must include a valid DSSE envelope signed with a trusted key. This provides supply chain security for agent deployments.

3. **Rate Limiting**: Protects against abuse. Configure limits based on expected traffic patterns.

4. **CORS**: Only allows localhost origins for browser-based development tools. Production deployments should review CORS policies.

5. **Input Validation**: All endpoints validate inputs before processing. Malformed JSON, missing required fields, and invalid URNs are rejected with appropriate error codes.

## Performance

- **SQLite WAL mode**: Allows concurrent reads and writes
- **Capability indexes**: Efficient querying by capability
- **Digest-based deduplication**: Prevents redundant provenance records
- **Rate limiting**: Prevents resource exhaustion

Typical response times (local development):
- `/health`: < 5ms
- `/openapi.json`: < 10ms
- `PUT /v1/registry/:urn`: < 50ms (with provenance)
- `GET /v1/registry/:urn`: < 10ms
- `POST /v1/query`: < 20ms

## Troubleshooting

### Error: "Registry API key must be provided"

**Cause:** Missing `apiKey` option or `REGISTRY_API_KEY` environment variable.

**Solution:** Provide `apiKey` in `createServer()` options or set environment variable.

### Error: "Provenance enforcement enabled but no verification keys were loaded"

**Cause:** `requireProvenance: true` but no valid public key found.

**Solution:** Provide `provenanceKeyPath` or `provenanceKeys` option, or set `requireProvenance: false` for testing.

### Error: "SQLITE_BUSY: database is locked"

**Cause:** Concurrent writes without WAL mode or busy_timeout pragma.

**Solution:** Ensure WAL mode is enabled (automatic in `openDb()`) and consider setting `busy_timeout` pragma in registry config.

### Empty results from `/v1/query`

**Cause:** Capabilities not projected correctly during manifest registration.

**Solution:** Verify manifest includes `capabilities` array. Check `capabilities` table directly:
```sql
SELECT * FROM capabilities WHERE urn = 'urn:agent:...';
```

## Future Enhancements

- [ ] Pagination for `/v1/query` results
- [ ] Webhook notifications on manifest updates
- [ ] Versioned URN resolution (resolve specific versions)
- [ ] Metrics export (Prometheus format)
- [ ] GraphQL query interface
- [ ] Multi-tenant support (namespace isolation)
- [ ] Read replicas for high-availability deployments

## References

- [DSSE Specification](https://github.com/secure-systems-lab/dsse)
- [SLSA Provenance v0.2](https://slsa.dev/provenance/v0.2)
- [In-toto Attestation Format](https://github.com/in-toto/attestation)
- [OpenAPI 3.0 Specification](https://spec.openapis.org/oas/v3.0.0)
- [Express Rate Limit](https://github.com/express-rate-limit/express-rate-limit)

---

**Delivered:** 2025-10-23  
**Mission ID:** IM-01A-20251101  
**Status:** Complete
