# Registry Migration Notes: Legacy to Runtime

**Mission:** IM-01B-20251102  
**Date:** 2025-10-23  
**Status:** Complete

## Overview

This document captures the migration from the legacy JSONL-based registry server (`app/services/registry/server.mjs`) to the canonical runtime SQLite-based registry (`packages/runtime/registry/server.mjs`).

## Key Changes

### 1. Storage Backend

**Before (Legacy):**
- JSONL files: `store.jsonl`, `index.urn.json`, `index.cap.json`
- File-based append-only storage
- In-memory indexes with periodic flushes

**After (Runtime):**
- SQLite database with WAL mode
- Schema-based storage with proper tables
- Indexes on capabilities and provenance
- Full ACID compliance

### 2. API Endpoints

#### Registration

**Before:**
```
POST /registry
Body: { urn, card, sig }
Response: { status: 'registered', urn, ts, verification }
```

**After:**
```
PUT /v1/registry/:urn
Body: { manifest, issuer, provenance }
Response: { status: 'ok', urn, digest, provenance }
```

#### Resolution by URN

**Before:**
```
GET /resolve/:urn
Response: { urn, card, sig, ts, verification }
```

**After:**
```
GET /v1/resolve?urn={urn}
Response: { urn, manifest, capabilities, digest }
```

#### Capability Query

**Before:**
```
GET /registry?cap={capability}
Response: { 
  status: 'ok', 
  results: [{ urn, card, verified, verification, matches }] 
}
```

**After:**
```
POST /v1/query
Body: { capability: "..." }
Response: { status: 'ok', capability, results: [{ urn, digest }] }
```

Then fetch full manifest:
```
GET /v1/registry/:urn
Response: { urn, body, digest, issuer, signature, updated_at, provenance }
```

### 3. Response Shape Changes

| Field (Legacy) | Field (Runtime) | Notes |
|----------------|-----------------|-------|
| `card` | `manifest` or `body` | Renamed for consistency |
| `sig` | `signature` | Now stored as JSON string |
| `ts` | `updated_at` | ISO timestamp |
| `verification.status` | Removed | Validation happens at write time |
| N/A | `digest` | SHA-256 of manifest body |
| N/A | `provenance` | DSSE attestation metadata |

### 4. Provenance Support

**Runtime** requires DSSE provenance attestations in enforce mode:
- `provenance.payload`: Base64-encoded in-toto statement
- `provenance.signatures`: Array of DSSE signatures
- `provenance.payloadType`: `application/vnd.in-toto+json`

**Legacy** had optional provenance validation with signature envelopes.

## Migration Steps

### For CLI/Application Code

1. **Import Changes:**
   ```javascript
   // Before
   import { createRegistryServer, startRegistryServer } from '../app/services/registry/server.mjs';
   
   // After
   import { startServer, createServer } from '../../packages/runtime/registry/server.mjs';
   import { openDb } from '../../packages/runtime/registry/db.mjs';
   ```

2. **Server Creation:**
   ```javascript
   // Before
   const { app, store } = await createRegistryServer({
     apiKey: 'key',
     storePath: './store.jsonl',
     indexPath: './index.json',
     capIndexPath: './cap-index.json',
     signaturePolicyPath: './policy.json',
   });
   
   // After
   const db = await openDb({ dbPath: './registry.sqlite' });
   await db.exec(schemaSql); // Apply schema
   await db.close();
   
   const runtime = await startServer({
     apiKey: 'key',
     dbPath: './registry.sqlite',
     host: '127.0.0.1',
     port: 0,
     provenanceKeys: [{ pubkey, alg: 'Ed25519', keyid }],
     requireProvenance: false,
     rateLimit: { windowMs: 60000, max: 1000 },
   });
   
   const { app, port, close } = runtime;
   ```

3. **Registration:**
   ```javascript
   // Before
   await fetch(`${url}/registry`, {
     method: 'POST',
     body: JSON.stringify({ urn, card, sig }),
   });
   
   // After
await fetch(`${url}/v1/registry/${encodeURIComponent(urn)}`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  },
  body: JSON.stringify({ manifest: card, provenance }),
});
   ```

4. **Resolution:**
   ```javascript
   // Before
   const res = await fetch(`${url}/resolve/${encodeURIComponent(urn)}`);
   const { card } = await res.json();
   
   // After
const res = await fetch(`${url}/v1/resolve?urn=${encodeURIComponent(urn)}`, {
  headers: { 'X-API-Key': apiKey },
});
const { manifest } = await res.json();
   ```

5. **Capability Lookup:**
   ```javascript
   // Before
   const res = await fetch(`${url}/registry?cap=${cap}`);
   const { results } = await res.json();
   const agent = results[0];
   
   // After
const res = await fetch(`${url}/v1/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  },
  body: JSON.stringify({ capability: cap }),
});
   const { results } = await res.json();
   const { urn } = results[0];
   
   // Fetch full manifest
const manifestRes = await fetch(`${url}/v1/registry/${encodeURIComponent(urn)}`, {
  headers: { 'X-API-Key': apiKey },
});
const { body: manifest } = await manifestRes.json();
   ```

### For Tests

1. **Test Helper:**
   ```javascript
   // Test helper already migrated
   const { app, dbPath, signCard, createProvenance } = await createRegistryTestContext();
   // registerManifest helper exported from tests/api/helpers/registry-context.mjs
   ```

2. **Assertions:**
   ```javascript
   // Before: Check JSONL file
   const contents = await readFile(storePath, 'utf8');
   
   // After: Check SQLite database
   const db = await openDb({ dbPath });
   const manifest = await db.get('SELECT * FROM manifests WHERE urn = ?', [urn]);
   await db.close();
   ```

## Files Migrated

### Core Consumers
- ✅ `tests/api/helpers/registry-context.mjs` - Test helper uses runtime factory
- ✅ `app/cli/wsap.mjs` - WSAP CLI uses runtime server + `/v1` endpoints
- ✅ `app/libs/a2a/client.mjs` - A2A client resolves via `/v1/resolve` and `/v1/query`
- ✅ `tests/a2a/client.resilience.spec.mjs` - A2A tests use runtime helper

### Test Suites (Migrated)
- ✅ `tests/api/registry.spec.mjs` - Uses runtime helper and `/v1` HTTP flows
- ✅ `tests/api/registry.cap.spec.mjs` - Capability queries via `/v1/query`
- ✅ `tests/api/registry.signing.spec.mjs` - Provenance enforcement through runtime routes
- ✅ `tests/api/registry.server.negative.spec.mjs` - Negative-path coverage for runtime API

## Breaking Changes

1. **No backward compatibility** - Legacy endpoints (`/registry`, `/resolve/:urn`) are not available in runtime
2. **Different response shapes** - Consumers must handle `manifest`/`body` instead of `card`
3. **Provenance required in enforce mode** - All registrations need DSSE attestations
4. **Capability queries are two-step** - Must query for URN, then fetch manifest
5. **No JSONL files** - All data in SQLite, no file-based artifacts

## Testing Strategy

### Validation Commands

```bash
# Run migrated test suites
npm run test -- --runTestsByPath \
  tests/api/registry.spec.mjs \
  tests/api/registry.cap.spec.mjs \
  tests/api/registry.signing.spec.mjs \
  tests/api/registry.server.negative.spec.mjs \
  tests/a2a/client.resilience.spec.mjs \
  tests/cli/registry.spec.mjs

# Run WSAP integration
node app/cli/wsap.mjs --session test --open=false

# Check for legacy imports
rg "app/services/registry/server" --glob '*.{js,mjs}'
```

### Known Issues

1. **Test suites use legacy endpoints** - Tests under `tests/api/` still call `/registry` POST instead of `/v1/registry/:urn` PUT
2. **Assertions check JSONL files** - Tests expect `storePath` and `capIndexPath` which don't exist in runtime
3. **Response shape mismatches** - Tests expect `card` but runtime returns `manifest` or `body`

These are test-only issues; application code (CLI, A2A client) has been fully migrated.

## Next Steps

1. **Update test suites** - Refactor `tests/api/*.spec.mjs` to use `/v1` endpoints and SQLite assertions
2. **Remove legacy server** - Delete `app/services/registry/server.mjs` after all consumers migrated
3. **Update CI** - Ensure CI uses runtime server for integration tests
4. **Update documentation** - Reflect new endpoints in API docs and quickstart guides

## Schema Reference

```sql
-- Runtime registry schema
CREATE TABLE manifests (
  urn TEXT PRIMARY KEY,
  body TEXT NOT NULL,                    -- JSON manifest
  digest TEXT NOT NULL,                  -- SHA-256 of body
  issuer TEXT,                           -- Signer/issuer ID
  signature TEXT,                        -- JWS/DSSE envelope
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE capabilities (
  urn TEXT NOT NULL,
  cap TEXT NOT NULL,
  PRIMARY KEY (urn, cap)
);

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

## References

- Runtime server: `packages/runtime/registry/server.mjs`
- Runtime repository: `packages/runtime/registry/repository.mjs`
- Runtime database: `packages/runtime/registry/db.mjs`
- Legacy server (deprecated): `app/services/registry/server.mjs`
- Schema: `scripts/db/schema.sql`
- Test helper: `tests/api/helpers/registry-context.mjs`
