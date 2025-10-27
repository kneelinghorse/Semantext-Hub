# Runtime Registry Migration Guide

**Mission:** IM-01D-20251104  
**Status:** Complete  
**Last Updated:** 2025-10-23

## Overview

This is the authoritative guide for working with the unified runtime registry server. After completing Mission IM-01 (phases A-D), the OSSP-AGI project has fully migrated from the legacy JSONL-based registry to the canonical SQLite-based runtime registry.

**Key Principle:** `packages/runtime/registry/server.mjs` is the **single entry point** for all registry operations.

## Quick Start

### Starting the Registry Server

```javascript
import { startServer } from '../../packages/runtime/registry/server.mjs';

const registryApiKey = process.env.REGISTRY_API_KEY;
if (!registryApiKey) {
  throw new Error('Set REGISTRY_API_KEY before starting the runtime registry.');
}

const runtime = await startServer({
  apiKey: registryApiKey,
  dbPath: './var/registry.sqlite',
  host: '127.0.0.1',
  port: 3000,
  provenanceKeys: [
    { pubkey: publicKeyPEM, alg: 'Ed25519', keyid: 'my-key-id' }
  ],
  requireProvenance: false, // Set to true for production
  rateLimit: { 
    windowMs: 60000, // 1 minute
    max: 1000        // max requests per window
  },
});

const { app, port, close } = runtime;
console.log(`Registry server running on http://${runtime.host}:${port}`);

// Cleanup
process.on('SIGTERM', () => close());
```

### For Testing

```javascript
import { createServer } from '../../packages/runtime/registry/server.mjs';
import request from 'supertest';

const app = await createServer({
  apiKey: 'test-key',
  requireProvenance: false,
  rateLimitConfigPath: null, // Disable rate limiting
});

const db = app.get('db');
// Initialize schema
await db.exec(schemaSql);

// Use with supertest
const response = await request(app)
  .get('/health')
  .expect(200);

// Cleanup
await db.close();
```

## API Endpoints

All endpoints require the `X-API-Key` header unless otherwise noted.

### Health Check

**No authentication required**

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "registry": {
    "driver": "sqlite",
    "wal": true,
    "journal_mode": "wal",
    "schema_version": 1,
    "expected_schema_version": 1,
    "records": 42,
    "disk": {
      "freeMegabytes": 1024,
      "thresholdBytes": 268435456,
      "healthy": true
    }
  },
  "rateLimit": {
    "windowMs": 60000,
    "max": 1000
  },
  "warnings": [],
  "errors": []
}
```

### OpenAPI Specification

**No authentication required**

```http
GET /openapi.json
```

Returns the OpenAPI 3.1 specification for the registry API.

### Register Manifest

```http
PUT /v1/registry/:urn
Content-Type: application/json
X-API-Key: your-api-key

{
  "manifest": {
    "id": "example-agent",
    "version": "1.0.0",
    "capabilities": ["cap.a", "cap.b"],
    "metadata": { "author": "Your Name" }
  },
  "provenance": {
    "payload": "base64-encoded-statement",
    "payloadType": "application/vnd.in-toto+json",
    "signatures": [{ "keyid": "key-id", "sig": "base64-sig" }]
  }
}
```

**Response:**
```json
{
  "status": "ok",
  "urn": "urn:example:agent:example-agent@v1.0.0",
  "digest": "sha256-hash",
  "provenance": {
    "builder": "builder-id",
    "commit": "commit-hash",
    "signature": { "keyid": "key-id" }
  }
}
```

**Notes:**
- `provenance` is optional unless `requireProvenance: true`
- Capabilities are automatically extracted and indexed
- Updates overwrite previous manifest and capabilities

### Fetch Manifest

```http
GET /v1/registry/:urn
X-API-Key: your-api-key
```

**Response:**
```json
{
  "urn": "urn:example:agent:example-agent@v1.0.0",
  "body": {
    "id": "example-agent",
    "version": "1.0.0",
    "capabilities": ["cap.a", "cap.b"]
  },
  "digest": "sha256-hash",
  "issuer": "builder-id",
  "signature": "dsse-signature",
  "updated_at": "2025-10-23T12:00:00Z",
  "provenance": {
    "builder": "builder-id",
    "commit": "commit-hash",
    "issuer": "builder-id",
    "digest": "sha256-hash",
    "materialsCount": 1,
    "buildTool": "tool-name",
    "committedAt": "2025-10-23T12:00:00Z",
    "recordedAt": "2025-10-23T12:00:00Z",
    "timestamp": "2025-10-23T12:00:00Z"
  }
}
```

### Resolve by URN

```http
GET /v1/resolve?urn=urn:example:agent:example-agent@v1.0.0
X-API-Key: your-api-key
```

**Response:**
```json
{
  "urn": "urn:example:agent:example-agent@v1.0.0",
  "manifest": {
    "id": "example-agent",
    "capabilities": ["cap.a", "cap.b"]
  },
  "capabilities": ["cap.a", "cap.b"],
  "digest": "sha256-hash"
}
```

### Query by Capability

```http
POST /v1/query
Content-Type: application/json
X-API-Key: your-api-key

{
  "capability": "cap.a"
}
```

**Response:**
```json
{
  "status": "ok",
  "capability": "cap.a",
  "results": [
    { "urn": "urn:example:agent:agent1@v1.0.0", "digest": "sha256-1" },
    { "urn": "urn:example:agent:agent2@v1.0.0", "digest": "sha256-2" }
  ]
}
```

**Note:** To get full manifests, follow up with `GET /v1/registry/:urn` for each result.

## Migration from Legacy API

### Breaking Changes

| Legacy Endpoint | Runtime Endpoint | Notes |
|----------------|------------------|-------|
| `POST /registry` | `PUT /v1/registry/:urn` | URN in path, not body |
| `GET /resolve/:urn` | `GET /v1/resolve?urn=...` | URN as query param |
| `GET /registry?cap=...` | `POST /v1/query` | POST with JSON body |

### Response Shape Changes

| Legacy Field | Runtime Field | Notes |
|-------------|---------------|-------|
| `card` | `manifest` or `body` | Renamed for consistency |
| `sig` | `signature` | Now DSSE envelope JSON |
| `ts` | `updated_at` | ISO 8601 timestamp |
| `verification.status` | Removed | Validation at write time |
| N/A | `digest` | SHA-256 of manifest |
| N/A | `provenance` | DSSE attestation metadata |

### Code Migration Examples

#### Registration

```javascript
// ❌ Legacy (deprecated)
await fetch(`${url}/registry`, {
  method: 'POST',
  body: JSON.stringify({ urn, card, sig }),
});

// ✅ Runtime (canonical)
await fetch(`${url}/v1/registry/${encodeURIComponent(urn)}`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  },
  body: JSON.stringify({ manifest: card, provenance }),
});
```

#### Resolution

```javascript
// ❌ Legacy (deprecated)
const res = await fetch(`${url}/resolve/${encodeURIComponent(urn)}`);
const { card } = await res.json();

// ✅ Runtime (canonical)
const res = await fetch(
  `${url}/v1/resolve?urn=${encodeURIComponent(urn)}`,
  { headers: { 'X-API-Key': apiKey } }
);
const { manifest } = await res.json();
```

#### Capability Query

```javascript
// ❌ Legacy (deprecated)
const res = await fetch(`${url}/registry?cap=${capability}`);
const { results } = await res.json();
const agent = results[0];

// ✅ Runtime (canonical)
const queryRes = await fetch(`${url}/v1/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  },
  body: JSON.stringify({ capability }),
});
const { results } = await queryRes.json();

// Fetch full manifests for each result
for (const { urn } of results) {
  const manifestRes = await fetch(
    `${url}/v1/registry/${encodeURIComponent(urn)}`,
    { headers: { 'X-API-Key': apiKey } }
  );
  const { body: manifest } = await manifestRes.json();
  // Use manifest...
}
```

## Configuration

### Environment Variables

- `REGISTRY_API_KEY` - API key for authentication
- `REGISTRY_DB_PATH` - Path to SQLite database file (default: `./var/registry.sqlite`)
- `REGISTRY_HOST` - Host to bind to (default: `127.0.0.1`)
- `REGISTRY_PORT` - Port to listen on (default: `0` for auto-assign)
- `REGISTRY_REQUIRE_PROVENANCE` - Require DSSE provenance (default: `false`)

### Database Schema

The runtime registry uses a SQLite database with the following tables:

```sql
-- Manifests table
CREATE TABLE manifests (
  urn TEXT PRIMARY KEY,
  body TEXT NOT NULL,                    -- JSON manifest
  digest TEXT NOT NULL,                  -- SHA-256 of body
  issuer TEXT,                           -- Signer/issuer ID
  signature TEXT,                        -- DSSE envelope
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Capabilities projection
CREATE TABLE capabilities (
  urn TEXT NOT NULL,
  cap TEXT NOT NULL,
  PRIMARY KEY (urn, cap)
);

-- Provenance attestations
CREATE TABLE provenance (
  urn TEXT NOT NULL,
  envelope TEXT NOT NULL,         -- DSSE JSON envelope
  payload_type TEXT NOT NULL,
  digest TEXT NOT NULL,           -- Manifest digest
  issuer TEXT NOT NULL,           -- Builder identifier
  committed_at TEXT NOT NULL,
  build_tool TEXT,
  inputs TEXT,                    -- JSON array
  outputs TEXT,                   -- JSON array
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (urn, digest)
);
```

Schema file: `scripts/db/schema.sql`

## Testing

### Running Parity Tests

The parity test suite validates full API compliance:

```bash
# Run parity test specifically
npm run test:registry:parity

# Run all registry tests
npm test -- tests/api/registry*.spec.mjs

# Run with coverage
npm run test:ci
```

### Test Helper

Use the registry test context helper for consistent test setup:

```javascript
import { createRegistryTestContext } from './tests/api/helpers/registry-context.mjs';

const { app, dbPath, signCard, createProvenance } = 
  await createRegistryTestContext();

// Use app with supertest
const response = await request(app)
  .put(`/v1/registry/${urn}`)
  .set('X-API-Key', 'test-key')
  .send({ manifest })
  .expect(200);
```

## CI Integration

### Automated Guardrails

Mission IM-01D introduces automated checks to prevent regressions:

```bash
# Run CI guard script (checks banned patterns + parity test)
npm run ci:check-registry

# This script will:
# 1. Verify runtime server exports exist
# 2. Scan for banned patterns (startHttpServer, legacy imports)
# 3. Run the parity test suite
```

### CI Pipeline Integration

Add to your CI workflow (e.g., GitHub Actions):

```yaml
- name: Registry Single-Entry Check
  run: npm run ci:check-registry

- name: Full Test Suite
  run: npm run test:ci
```

### Banned Patterns

The CI guard script fails if these patterns are detected:

1. **`startHttpServer(`** - Legacy server pattern
   - ✅ Use: `createServer()` or `startServer()` from runtime
   
2. **`from 'app/services/registry/server.mjs'`** - Legacy import
   - ✅ Use: `from 'packages/runtime/registry/server.mjs'`
   
3. **`RegistryStore`** - Legacy JSONL storage class
   - ✅ Use: SQLite repository from `packages/runtime/registry/repository.mjs`

**Allowed exceptions** (for backward compatibility/documentation):
- `app/services/registry/server.mjs` (deprecated re-export)
- Documentation files
- CI guard script itself

## Troubleshooting

### Database Locked

If you encounter "database is locked" errors:

```javascript
// Enable WAL mode for better concurrency
import { openDb } from '../../packages/runtime/registry/db.mjs';

const db = await openDb({ dbPath: './registry.sqlite' });
await db.exec('PRAGMA journal_mode=WAL;');
await db.close();
```

### Rate Limiting

To disable rate limiting in tests:

```javascript
const app = await createServer({
  rateLimitConfigPath: null, // Disables rate limiting
});
```

To adjust limits:

```javascript
const app = await startServer({
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,                  // 100 requests per window
  },
});
```

### Provenance Validation Failures

If provenance validation fails:

1. **Verify key configuration:**
   ```javascript
   provenanceKeys: [
     { 
       pubkey: publicKeyPEM,  // Must be PEM format
       alg: 'Ed25519',        // Must match signature algorithm
       keyid: 'my-key-id'     // Must match envelope keyid
     }
   ]
   ```

2. **Check envelope structure:**
   ```javascript
   import { createEnvelope } from '../../packages/runtime/security/dsse.mjs';
   
   const envelope = createEnvelope(
     'application/vnd.in-toto+json',
     payload,
     { key: privateKeyPEM, alg: 'Ed25519', keyid: 'my-key-id' }
   );
   ```

3. **Disable for testing:**
   ```javascript
   const app = await createServer({
     requireProvenance: false, // Allows registration without provenance
   });
   ```

## Architecture

### Single-Entry Pattern

```
┌─────────────────────────────────────────────────────────┐
│  Canonical Runtime Server                                │
│  packages/runtime/registry/server.mjs                    │
│                                                           │
│  Exports:                                                 │
│  - createServer(config) → Express app                     │
│  - startServer(config) → { app, port, host, close }      │
│  - loadOpenApiSpec() → OpenAPI spec                      │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  Repository Layer                                         │
│  packages/runtime/registry/repository.mjs                │
│                                                           │
│  Functions:                                               │
│  - registerManifest(db, urn, manifest, provenance)       │
│  - getManifest(db, urn)                                  │
│  - queryByCapability(db, capability)                     │
│  - resolveUrn(db, urn)                                   │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  Database Layer                                           │
│  packages/runtime/registry/db.mjs                        │
│                                                           │
│  Functions:                                               │
│  - openDb(options) → sqlite Database                     │
│  - getSchemaVersion(db)                                  │
│  - getRecordCount(db)                                    │
└─────────────────────────────────────────────────────────┘
```

### Legacy Compatibility

The legacy server at `app/services/registry/server.mjs` is a **thin re-export** with deprecation warnings:

```javascript
// app/services/registry/server.mjs
console.warn('DEPRECATED: Use packages/runtime/registry/server.mjs');
export * from '../../packages/runtime/registry/server.mjs';
```

**Status:** Marked for removal in future release

## References

### Source Files

- Runtime server: [`packages/runtime/registry/server.mjs`](../../packages/runtime/registry/server.mjs)
- Repository layer: [`packages/runtime/registry/repository.mjs`](../../packages/runtime/registry/repository.mjs)
- Database layer: [`packages/runtime/registry/db.mjs`](../../packages/runtime/registry/db.mjs)
- Schema: [`scripts/db/schema.sql`](../../scripts/db/schema.sql)
- Parity test: [`tests/runtime/registry.http.parity.spec.mjs`](../../tests/runtime/registry.http.parity.spec.mjs)
- CI guard: [`scripts/ci/check-registry-single-entry.mjs`](../../scripts/ci/check-registry-single-entry.mjs)

### Documentation

- Integration guide: [`docs/runtime-integration-guide.md`](../runtime-integration-guide.md)
- Migration notes: [`docs/runtime/registry-migration-notes.md`](./registry-migration-notes.md) (historical)
- API reference: [`docs/api-reference.md`](../api-reference.md)

### Related Missions

- **IM-01A**: Parity harness creation
- **IM-01B**: Migration notes and documentation
- **IM-01C**: Legacy stack retirement
- **IM-01D**: CI integration and guardrails (this mission)

## Support

For questions or issues:

1. Check the [troubleshooting section](#troubleshooting)
2. Review [test examples](../../tests/runtime/registry.http.parity.spec.mjs)
3. Consult [runtime integration guide](../runtime-integration-guide.md)
4. Run diagnostics: `npm run ci:check-registry`

---

**Mission Status:** ✅ Complete  
**Last Verified:** 2025-10-23  
**Next Review:** After next major registry feature release
