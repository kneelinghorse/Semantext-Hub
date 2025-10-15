# IAM Delegation Security Model

## Overview

The IAM Delegation system enables secure agent-to-agent authorization chains with built-in security constraints. This document describes the security model, constraints, and best practices for delegation chains.

## Security Architecture

### Core Principles

1. **Least Privilege**: Delegations can only narrow scopes, never expand them
2. **Depth Limitation**: Maximum delegation depth capped at 5 levels
3. **Time-Bounded**: Optional expiration enforcement
4. **Explicit Authorization**: Every delegation requires explicit URN validation

### DelegationManifest Schema

```javascript
{
  delegation: {
    delegator_agent_urn: string,    // URN of delegating agent
    delegate_agent_urn: string,     // URN of delegate agent
    scopes: string[],               // Delegated permissions (non-empty)
    max_depth: number,              // Chain depth limit (1-5)
    expires_at?: string,            // ISO8601 expiration (optional)
    constraints?: {                 // Additional constraints (optional)
      revoke_on_error?: boolean
    }
  }
}
```

## Security Constraints

### 1. Maximum Delegation Depth (max_depth ≤ 5)

**Rationale**: Deep delegation chains increase attack surface and make audit trails difficult to trace.

**Enforcement**:
- Hard limit at 5 levels enforced by validator
- `createDelegationManifest()` automatically clamps to 5
- Validation fails for max_depth > 5

**Example**:
```javascript
// Safe: 5-level chain
Root (depth=5) → A (depth=4) → B (depth=3) → C (depth=2) → D (depth=1) → E

// Rejected: depth > 5
createDelegationManifest(urn1, urn2, scopes, 10);  // Clamped to 5
```

### 2. Scope Narrowing (No Privilege Escalation)

**Rationale**: Prevents privilege escalation attacks where downstream agents gain more permissions than their delegators.

**Enforcement**:
- Child scopes must be a strict subset of parent scopes
- `validateDelegationChain()` checks scope containment
- Fails if child has any scope not in parent

**Example**:
```javascript
// Safe: scope narrowing
Parent: ['admin', 'read', 'write', 'execute']
Child:  ['read', 'execute']  // ✓ Subset

// Rejected: scope expansion
Parent: ['read']
Child:  ['read', 'write']  // ✗ 'write' not in parent
```

### 3. URN Validation

**Rationale**: Ensure delegation participants are valid agents in the system.

**Enforcement**:
- Both delegator and delegate URNs validated against protocol regex
- Must match: `urn:proto:agent:[name]@[version]` or other valid URN formats
- Validation fails for malformed URNs

**Example**:
```javascript
// Valid
'urn:proto:agent:orchestrator@1.1.1'
'urn:proto:iam:service-account@1.1.1#auth-service'

// Invalid
'agent:orchestrator'  // ✗ Not a URN
'urn:custom:xyz'      // ✗ Wrong namespace
```

### 4. Depth Monotonicity

**Rationale**: Each delegation step must reduce remaining depth to prevent circular chains.

**Enforcement**:
- Child max_depth must be strictly less than parent max_depth
- `validateDelegationChain()` enforces: `child.max_depth < parent.max_depth`

**Example**:
```javascript
// Safe
Parent: max_depth = 3
Child:  max_depth = 2  // ✓ Decreases

// Rejected
Parent: max_depth = 2
Child:  max_depth = 2  // ✗ Not strictly decreasing
```

### 5. Temporal Bounds (Optional)

**Rationale**: Limit delegation lifetime to reduce window of compromise.

**Enforcement**:
- Optional `expires_at` field (ISO8601 timestamp)
- `isDelegationExpired()` checks current time vs expiration
- Validators ensure valid ISO8601 format

**Example**:
```javascript
const delegation = createDelegationManifest(
  delegatorUrn,
  delegateUrn,
  scopes,
  depth,
  { expiresAt: '2025-12-31T23:59:59Z' }
);

isDelegationExpired(delegation);  // false before expiry, true after
```

## Validation API

### Core Validator: `delegation.core`

Automatically registered with IAM protocol. Validates:
- ✓ Delegator URN format
- ✓ Delegate URN format
- ✓ Scopes non-empty array
- ✓ max_depth in range [1, 5]
- ✓ expires_at valid ISO8601 (if present)

### Chain Validator: `validateDelegationChain(parent, child)`

Validates delegation chains:
- ✓ Child max_depth < parent max_depth
- ✓ Child scopes ⊆ parent scopes
- Returns `{ok: boolean, issues: Array}`

### Expiration Check: `isDelegationExpired(delegation, now?)`

Checks temporal validity:
- Returns `false` if no expiration set
- Returns `true` if current time ≥ expires_at
- Accepts optional `now` parameter for testing

## Usage Examples

### Creating a Simple Delegation

```javascript
import { createDelegationManifest } from './Identity & Access Protocol — v1.1.1.js';

const delegation = createDelegationManifest(
  'urn:proto:agent:orchestrator@1.1.1',
  'urn:proto:agent:worker@1.1.1',
  ['payment.read', 'payment.execute'],
  3,
  {
    expiresAt: '2025-12-31T23:59:59Z',
    constraints: { revoke_on_error: true }
  }
);
```

### Validating a Delegation Chain

```javascript
import {
  createDelegationManifest,
  validateDelegationChain
} from './Identity & Access Protocol — v1.1.1.js';

// A → B
const delegationAB = createDelegationManifest(
  'urn:proto:agent:a@1.1.1',
  'urn:proto:agent:b@1.1.1',
  ['admin', 'read', 'write'],
  5
);

// B → C (scope narrowing)
const delegationBC = createDelegationManifest(
  'urn:proto:agent:b@1.1.1',
  'urn:proto:agent:c@1.1.1',
  ['read'],
  4
);

const result = validateDelegationChain(delegationAB, delegationBC);
if (!result.ok) {
  console.error('Chain validation failed:', result.issues);
}
```

### Running Validators

```javascript
import { Validators } from './Identity & Access Protocol — v1.1.1.js';

const validator = Validators.get('delegation.core');
const result = validator(delegation);

if (!result.ok) {
  result.issues.forEach(issue => {
    console.error(`${issue.path}: ${issue.msg}`);
  });
}
```

## Security Best Practices

### 1. Minimize Delegation Depth

- **Goal**: Keep chains as short as possible
- **Recommendation**: Use depth ≤ 3 for most scenarios
- **Rationale**: Shorter chains = simpler audit trails

### 2. Use Explicit Expiration

- **Goal**: Limit temporal attack window
- **Recommendation**: Always set `expires_at` for production delegations
- **Rationale**: Prevents indefinite authorization

### 3. Scope Minimization

- **Goal**: Grant minimum necessary permissions
- **Recommendation**: Start with narrow scopes, expand only if needed
- **Rationale**: Reduces blast radius of compromise

### 4. Constraint Enforcement

- **Goal**: Add runtime safety nets
- **Recommendation**: Use `revoke_on_error: true` for critical operations
- **Rationale**: Automatic revocation on anomalous behavior

### 5. Audit Trail Maintenance

- **Goal**: Track delegation chains for forensics
- **Recommendation**: Log all delegation creations and validations
- **Rationale**: Essential for incident response

## Attack Mitigation

### Privilege Escalation

**Attack**: Child agent attempts to gain scopes not granted by parent

**Mitigation**:
- `validateDelegationChain()` enforces scope containment
- Validation fails immediately if child has unauthorized scopes

### Circular Delegation

**Attack**: Agent A delegates to B, B delegates back to A

**Mitigation**:
- Monotonically decreasing `max_depth` prevents cycles
- Each step reduces available depth, making circles impossible

### Deep Chain Amplification

**Attack**: Create arbitrarily deep chains to obscure audit trails

**Mitigation**:
- Hard limit at 5 levels enforced by validator
- `createDelegationManifest()` clamps to 5 automatically

### Expired Delegation Replay

**Attack**: Reuse expired delegation credentials

**Mitigation**:
- `isDelegationExpired()` checks temporal validity
- Runtime systems should reject expired delegations

### URN Spoofing

**Attack**: Use malformed or fake URNs to impersonate agents

**Mitigation**:
- Strict URN format validation in `delegation.core`
- Both delegator and delegate URNs must match protocol regex

## Testing

The delegation system includes 26+ comprehensive tests covering:

- ✓ Valid delegation creation
- ✓ URN validation (delegator & delegate)
- ✓ Scope validation (non-empty, subset enforcement)
- ✓ max_depth validation (range [1,5])
- ✓ Expiration validation (ISO8601 format, temporal checks)
- ✓ Chain validation (A→B, A→B→C, 5-level chains)
- ✓ Security constraint enforcement

Run tests:
```bash
npm test -- tests/security/delegation.test.js
```

## Future Enhancements

1. **Dynamic Scope Resolution**: Allow pattern-based scope matching
2. **Delegation Revocation**: Add explicit revocation mechanisms
3. **Audit Logging**: Built-in delegation event logging
4. **Quota Enforcement**: Limit number of active delegations per agent
5. **Cross-Protocol Integration**: Link delegations with Workflow/Agent protocols

## References

- Identity & Access Protocol v1.1.1: `src/Identity & Access Protocol — v1.1.1.js`
- Delegation Tests: `tests/security/delegation.test.js`
- Suite Wiring v1.1: `src/suite_wiring_v_1_1.js`
- Agent Protocol v1.1.1: `src/agent_protocol_v_1_1_1.js`

---

**Version**: 1.0
**Last Updated**: 2025-10-03
**Status**: Production Ready
