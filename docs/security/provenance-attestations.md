# DSSE Provenance Attestations

## Overview

S20.2 implements DSSE (Dead Simple Signing Envelope) attestations with in-toto provenance for all manifests. This provides cryptographic verification of build provenance and enforces attestation requirements at registry write time and in the release gate.

## Components

### 1. DSSE Envelope (`packages/runtime/security/dsse.mjs`)

Implements DSSE envelope creation and verification supporting:
- **Ed25519** signatures (default)
- **ES256** (ECDSA P-256) signatures
- Proper PAE (Pre-Authentication Encoding) format
- Base64 encoding for payloads and signatures

**Example:**
```javascript
import { createEnvelope, verifyEnvelope } from './dsse.mjs';

const envelope = createEnvelope(
  'application/vnd.in-toto+json',
  payloadObject,
  { key: privateKey, alg: 'Ed25519', keyid: 'my-key' }
);

const result = verifyEnvelope(envelope, { pubkey: publicKey, alg: 'Ed25519' });
// result: { ok: boolean, errorReason: string|null }
```

### 2. Provenance Validation (`packages/runtime/security/provenance.mjs`)

Validates in-toto style provenance payloads with required fields:
- `builder.id` - Builder/CI system identifier
- `materials` - Input artifacts (array)
- `metadata.commit` - Git commit SHA

**Example:**
```javascript
import { validateProvenance, createProvenancePayload } from './provenance.mjs';

const payload = createProvenancePayload({
  builderId: 'ci-system',
  commit: 'abc123',
  materials: [{ uri: 'git+https://github.com/org/repo' }]
});

const envelope = createEnvelope('application/vnd.in-toto+json', payload, { key, alg: 'Ed25519' });
const validation = validateProvenance(envelope, { pubkey, alg: 'Ed25519' });
```

### 3. Database Storage (`scripts/db/schema.sql`)

The `provenance` table stores attestations linked to URNs:

```sql
CREATE TABLE provenance (
  urn TEXT NOT NULL,
  envelope TEXT NOT NULL,         -- DSSE JSON envelope
  payload_type TEXT NOT NULL,
  digest TEXT NOT NULL,           -- SHA256 of manifest
  issuer TEXT NOT NULL,           -- Builder identifier
  committed_at TEXT NOT NULL,
  build_tool TEXT,
  inputs TEXT,                    -- JSON array
  outputs TEXT,                   -- JSON array
  PRIMARY KEY (urn, digest)
);
```

### 4. Registry Enforcement (`app/services/registry/server.mjs`)

Registry PUT endpoints enforce provenance in `enforce` mode:

**Enforcement behavior:**
- `mode: permissive` → Provenance optional, warnings logged
- `mode: enforce` → Provenance required, 422 error if missing/invalid

**Response codes:**
- `201/200` - Success with valid provenance
- `422` - `missing_provenance` when required but not provided
- `422` - `invalid_provenance` when signature/structure is invalid

### 5. CLI Verification (`packages/runtime/cli/commands/attest-verify.js`)

Command-line tool for verifying attestations across changed URNs:

```bash
# Verify all changes since last commit
ossp attest-verify

# Verify changes since specific ref
ossp attest-verify --since origin/main

# Custom output location
ossp attest-verify --output reports/provenance.json
```

**Exit codes:**
- `0` - All URNs have valid provenance
- `1` - One or more URNs missing or invalid provenance
- `2` - Fatal error (database, git, etc.)

## Release Gate Integration

The CI workflow (`.github/workflows/ci-provenance-gate.yml`) runs on every PR and main push:

1. **Detect changed manifests** - Uses git diff to find modified files
2. **Extract URNs** - Parses file paths to URN identifiers
3. **Query database** - Retrieves provenance records for each URN
4. **Validate attestations** - Verifies DSSE signatures and provenance structure
5. **Block release** - Fails build if any URN lacks valid provenance

## Provenance Payload Schema

Minimal in-toto provenance format:

```json
{
  "_type": "https://in-toto.io/Statement/v0.1",
  "buildType": "ossp-manifest-v1",
  "builder": {
    "id": "ci-system-identifier"
  },
  "materials": [
    {
      "uri": "git+https://github.com/org/repo",
      "digest": { "sha256": "abc123..." }
    }
  ],
  "metadata": {
    "commit": "abc123def456",
    "timestamp": "2025-10-22T00:00:00Z",
    "buildTool": "ossp-cli"
  },
  "inputs": [{ "name": "src/manifest.json" }],
  "outputs": [{ "name": "approved/manifest.json" }]
}
```

## Usage Examples

### Creating Attestations

```javascript
import { createEnvelope } from './packages/runtime/security/dsse.mjs';
import { createProvenancePayload } from './packages/runtime/security/provenance.mjs';

const provenance = createProvenancePayload({
  builderId: 'github-actions',
  commit: process.env.GITHUB_SHA,
  materials: [
    { uri: `git+${process.env.GITHUB_REPOSITORY}` }
  ]
});

const envelope = createEnvelope(
  'application/vnd.in-toto+json',
  provenance,
  { key: privateKeyPem, alg: 'Ed25519', keyid: 'ci-key' }
);

// Include in registry PUT
await fetch(`${registryUrl}/v1/registry/${urn}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
  body: JSON.stringify({ urn, card, sig, provenance: envelope })
});
```

### Querying Provenance

```javascript
import { getManifest, getProvenance } from './packages/runtime/registry/repository.mjs';

// Get latest provenance summary
const manifest = await getManifest(db, urn);
console.log(manifest.provenance); 
// { builder: 'ci-system', timestamp: '...' }

// Get full provenance history
const history = await getProvenance(db, urn);
history.forEach(record => {
  console.log(`${record.issuer} at ${record.committedAt}`);
});
```

## Security Model

### Signature Verification

1. **DSSE PAE** - Uses proper Pre-Authentication Encoding
2. **Cryptographic validation** - Ed25519 or ES256 signatures verified
3. **Key management** - Public keys from signature policy configuration
4. **Tamper detection** - Any modification to payload invalidates signature

### Policy Configuration

Signature policy (`app/config/security/signature-policy.json`) controls enforcement:

```json
{
  "mode": "enforce",
  "allowedIssuers": [
    {
      "keyId": "ci-key-1",
      "publicKey": "-----BEGIN PUBLIC KEY-----...",
      "description": "GitHub Actions CI key"
    }
  ]
}
```

## Testing

Comprehensive test coverage in `tests/security/`:

- **dsse.spec.mjs** - Envelope creation/verification, tampering detection
- **provenance.spec.mjs** - Payload validation, required fields, enforcement scenarios
- **provenance-integration.spec.mjs** - End-to-end database integration

Run tests:
```bash
npm test -- --testPathPattern="tests/security/(dsse|provenance)"
```

## Troubleshooting

### Common Issues

**Missing provenance error:**
```json
{ "error": "missing_provenance", "message": "DSSE provenance attestation is required in enforce mode." }
```
→ Add provenance envelope to request body

**Invalid signature:**
```json
{ "error": "invalid_provenance", "reason": "invalid-signature" }
```
→ Check key configuration, ensure correct public/private key pair

**Missing builder.id:**
```json
{ "reason": "missing-builder-id" }
```
→ Ensure provenance payload includes `builder.id` field

### Debug Mode

Enable detailed logging:
```bash
DEBUG=1 ossp attest-verify --since HEAD~5
```

## Future Enhancements

Potential improvements tracked for future sprints:
- Multi-signature support (threshold signatures)
- Revocation checking via transparency log
- Automated key rotation
- Policy-based material constraints
- Slsa level 3+ compliance

## References

- [DSSE Specification](https://github.com/secure-systems-lab/dsse)
- [in-toto Attestation Framework](https://in-toto.io/)
- [SLSA Provenance](https://slsa.dev/provenance/)

