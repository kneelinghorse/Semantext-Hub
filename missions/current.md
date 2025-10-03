# Mission B5.2: Security Redaction Utilities
*Week 5, Day 2-3 – Production Polish*

## Context Load
```json
{
  "required_context": [
    "PROJECT_CONTEXT.json",
    "AI_HANDOFF.md",
    "missions/research/SPRINT_05_RESEARCH_R5.3.md",
    "missions/week-05/BUILD_WEEK5.md"
  ],
  "optional_context": [],
  "estimated_tokens": 20000
}
```

## Objective
Build production-ready redaction utilities for secrets and PII to protect logs, generated docs, and catalog outputs. Provide configurable rules, fast performance, and simple integration hooks.

## Technical Requirements

### Core Implementation
```javascript
/** Security Redaction Core (ESM) */
export class SecretDetector {
  constructor(patterns, entropyThreshold = 4.5) {
    this.patterns = patterns; // Map<string, RegExp>
    this.entropyThreshold = entropyThreshold;
  }
  scan(text) {
    const findings = [];
    for (const [name, rx] of this.patterns) {
      let m;
      rx.lastIndex = 0;
      while ((m = rx.exec(text))) findings.push({ name, index: m.index, value: m[0] });
    }
    if (this._entropy(text) >= this.entropyThreshold) findings.push({ name: 'high_entropy', index: 0 });
    return findings;
  }
  _entropy(s) {
    const freq = new Map();
    for (const c of s) freq.set(c, (freq.get(c) || 0) + 1);
    let H = 0;
    for (const c of freq.values()) { const p = c / s.length; H -= p * Math.log2(p); }
    return H;
  }
}

export class ManifestRedactor {
  constructor({ fields = [], placeholder = '[REDACTED]' } = {}) {
    this.fields = fields; // Array<RegExp>
    this.placeholder = placeholder;
  }
  redact(obj) {
    const walk = (o) => {
      if (o && typeof o === 'object') {
        for (const k of Object.keys(o)) {
          if (this.fields.some(rx => rx.test(k))) o[k] = typeof o[k] === 'string' ? this.placeholder : walk(o[k]);
          else o[k] = walk(o[k]);
        }
      }
      return o;
    };
    return walk(structuredClone(obj));
  }
}

export function createSafeLogger({ redactedPaths = ['headers.authorization', 'password'] } = {}) {
  // Integrate with pino redaction or a simple wrapper here
  return { info: (...args) => console.log(...args) };
}
```

### Rule Sets
- Credential patterns: AWS keys, GitHub tokens, Stripe keys, SSH private keys, JWTs, common connection strings.
- High-risk fields: password, secret, token, apiKey, credentials, privateKey, connectionString, databaseUrl.
- Entropy check: threshold 4.5 for base64-like segments.

### Integration Points
- CLI: redact outputs before printing and before writing artifacts.
- Catalog: redact governance-sensitive fields when exporting or reporting.
- Logging: apply redaction to structured logs (headers.authorization, cookies, tokens).

## Deliverables Checklist
- [ ] File: `app/src/security/redaction.js`
- [ ] File: `app/src/security/rules.js`
- [ ] File: `app/src/security/index.js`
- [ ] Tests: `app/tests/security/redaction.test.js`
- [ ] Tests: `app/tests/security/integration.test.js`
- [ ] Update: `AI_HANDOFF.md`
- [ ] Log: Append to `SESSIONS.jsonl`

## Success Validation
```bash
# Run tests
npm --prefix app test -- tests/security

# Coverage
npm --prefix app test -- --coverage tests/security

# Spot check integration (catalog sample)
node --experimental-vm-modules app/scripts/bench-catalog.js | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log('ok'))"
```

## End-of-Mission Output
Generate this JSON for SESSIONS.jsonl:
```json
{
  "session": "W5-B5.2",
  "date": "<ISO_DATE>",
  "mission": "Security Redaction Utilities",
  "domain": "security",
  "tokens_in": 20000,
  "tokens_out": 8000,
  "deliverables": [
    "app/src/security/redaction.js",
    "app/src/security/rules.js",
    "app/src/security/index.js",
    "app/tests/security/redaction.test.js",
    "app/tests/security/integration.test.js"
  ],
  "ai_model": "<model_used>"
}
```

## Notes for AI
- Use findings from `missions/research/SPRINT_05_RESEARCH_R5.3.md` (patterns, entropy, logging).
- Favor Map/Set and precompiled RegExp for speed; avoid deep clones except for redaction (use structuredClone where available).
- Keep APIs streaming-safe where feasible; minimize allocations in hot paths.
- Integrate smoothly with outputs from B5.1 (catalog index in `app/src/catalog/*`).
- Provide deterministic tests for both detection (TP/FP corpus) and redaction structure preservation.
