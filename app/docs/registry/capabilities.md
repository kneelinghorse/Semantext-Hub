# Capability Query API

The registry exposes a capability discovery endpoint for agents that satisfy one or more capability identifiers.

## Endpoint

- **Method:** `GET`
- **Route:** `/registry`
- **Authentication:** `X-API-Key` header
- **Query Parameters:**
  - `cap`: one or more capability identifiers. Repeat the parameter (`?cap=a&cap=b`) or pass a comma-separated list.
  - `limit` (optional): page size (default `25`, maximum `100`).
  - `offset` (optional): zero-based index for pagination (default `0`).

Requests are subject to the registry's standard rate limiter (default `60` requests per minute per IP, configurable via `config/security/rate-limit.config.json`).

## Capability Identifier Format

Capability strings are matched case-insensitively and must conform to:

```
^[a-z0-9][a-z0-9._:-]*(?:@[a-z0-9][a-z0-9._:-]*)?(?:#[a-z0-9][a-z0-9._:-]*)?$
```

- Length must not exceed 256 characters.
- Common examples: `protocol:api@1.1.1`, `protocol:api@1.1.1#stream`, `ml:inference`.
- Identifiers may include optional version segments (`@1.2.3`) and selectors (`#stream`).

Invalid strings result in a `400 invalid_query` response with per-value diagnostics.

## Matching Behaviour

- All provided `cap` values must match the same agent record.
- Exact matches (identical capability string) are returned before partial matches (prefix relationship such as `protocol:api@1.1.1` matching `protocol:api@1.1.1#stream`).
- Only agents with verified signatures (`verification.status === "verified"`) are included.
- Each result includes the agent card, verification metadata, and match breakdown for each requested capability.

Pagination metadata (`total`, `limit`, `offset`) is returned alongside the result list so clients can page through larger result sets deterministically.
