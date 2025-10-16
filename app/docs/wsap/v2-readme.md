# WSAP v2 Multi-Agent Runbook

The WSAP v2 orchestration extends the original workflow assessment pipeline with
multi-agent validation, signed artifacts, and runtime budget tracking.

## Execution Flow

1. **Seed Discovery** - Imports an OpenAPI seed and approves the manifest.
2. **Catalog Planning** - Builds the catalog graph, Draw.io diagram, and Cytoscape export.
3. **Registry Bring-Up** - Launches a local registry with a fresh Ed25519 key and policy, then registers three signed agents.
4. **A2A Verification** - Exercises each agent by URN and capability using the resilient A2A client with metrics logging.
5. **Artifact Reporting** - Captures a machine-readable `report.json` summarising registry, A2A, and artifact outputs.
6. **Signature Gate** - Signs `report.json` and `diagram.drawio` using the session key and writes detached JWS envelopes.

## Artifacts

| Artifact | Description |
| --- | --- |
| `report.json` | Multi-agent session summary, registry entries, and call outcomes. |
| `report.json.sig.json` | Detached JWS envelope (identity-access.signing.v1) for the report. |
| `drawio/catalog.drawio` | Generated architecture diagram for the approved manifest. |
| `drawio/catalog.drawio.sig.json` | Detached signature for the diagram. |
| `registry/signature-policy.json` | Enforced signature policy that enabled agent registration. |
| `registry/wsap-ed25519.pub.pem` | Public key for downstream verification. |

## Performance Budgets

WSAP v2 introduces a `runtime` budget class which covers registry provisioning and A2A calls:

- `wsap/runtime`: avg <= 2200 ms, p95 <= 3600 ms
- Existing `ingest` and `plan` buckets remain unchanged.

## Verification Tips

- Verify signatures with `verifyJws` and the generated public key:
  ```js
  import { verifyJws } from '../libs/signing/jws.mjs';
  const envelope = JSON.parse(await fs.readFile('report.json.sig.json', 'utf8'));
  const verification = verifyJws(envelope, {
    publicKey: await fs.readFile('registry/wsap-ed25519.pub.pem', 'utf8'),
    expectedPayload: JSON.parse(await fs.readFile('report.json', 'utf8')),
  });
  ```
- Inspect `metrics/wsap-*.jsonl` for per-step durations and correlation IDs.
- Use `registry/index.json` and `cap-index.json` for introspecting capability lookups.
