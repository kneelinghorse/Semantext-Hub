# Override System Documentation

## Overview

The Community Overrides Engine enables crowdsourced improvements to protocol discovery through shareable rule packs. Override rules enhance PII detection, API pattern recognition, and field classifications with community-validated patterns.

## Features

- **Rule Precedence**: Project > Organization > Community
- **Confidence Scoring**: Base confidence + temporal decay + verification boost
- **Pattern Matching**: Field names, data formats, API endpoints, response patterns
- **Rule Export**: Convert detections to shareable rules
- **Performance**: <5ms rule matching per field
- **Bundled Packs**: Stripe, GitHub patterns included

## Architecture

```
app/
├── core/
│   └── overrides/
│       ├── index.js          # Main OverrideEngine
│       ├── schema.js         # Rule schema & validation
│       ├── loader.js         # Rule loading with precedence
│       ├── matcher.js        # Pattern matching engine
│       └── exporter.js       # Rule export utilities
├── importers/
│   ├── postgres/
│   │   └── pii-detector-enhanced.js    # PII detection with overrides
│   └── openapi/
│       └── patterns-enhanced.js        # API patterns with overrides
└── overrides/
    └── community/
        ├── stripe/           # Stripe API patterns & PII rules
        └── github/           # GitHub API patterns
```

## Usage

### Basic Usage

```javascript
const { OverrideEngine } = require('./core/overrides');

// Initialize engine (auto-loads community/org/project rules)
const engine = new OverrideEngine('/path/to/project');

// Match PII patterns
const match = engine.matchPIIPattern('customer_email', {
  context: 'orders',
  protocol: 'stripe'
});

if (match) {
  console.log(`Matched rule: ${match.rule.id}`);
  console.log(`Confidence: ${match.confidence}`);
  console.log(`Classification: ${match.rule.classification}`);
}

// Enhance existing detection
const detection = {
  fieldName: 'email',
  context: 'users',
  type: 'email',
  confidence: 0.75
};

const enhanced = engine.enhanceDetection(detection, 'pii');
console.log(`Enhanced confidence: ${enhanced.confidence}`);
```

### Creating Rules

```javascript
// Create rule from detection
const detection = {
  fieldName: 'customer_email',
  context: 'orders',
  type: 'email',
  confidence: 0.88,
  dataPattern: '^[^\\s@]+@[^\\s@]+$'
};

const rule = engine.createRule(detection, 'pii', {
  author: 'your-name',
  protocol: 'ecommerce',
  description: 'Customer email in orders table'
});

// Export to file
engine.exportRules('.proto/overrides/my-rules.json', {
  pretty: true
});

// Export as pack
engine.exportPack('my-pack', './overrides', {
  version: '1.0.0',
  description: 'E-commerce patterns',
  author: 'your-name',
  tags: ['ecommerce', 'pii']
});
```

### Integration with Importers

```javascript
// Postgres with overrides
const { createPostgresOverrideEngine } = require('./importers/postgres/pii-detector-enhanced');
const overrideEngine = createPostgresOverrideEngine('/path/to/project');

// Use in importer
const result = detectPIIWithOverrides(
  'customer_email',
  'varchar',
  ['test@example.com', 'user@test.org'],
  {},
  {
    context: 'customers',
    protocol: 'postgres',
    overrideEngine
  }
);

// OpenAPI with overrides
const { createOpenAPIOverrideEngine } = require('./importers/openapi/patterns-enhanced');
const apiOverrides = createOpenAPIOverrideEngine('/path/to/project');

const pagination = detectPaginationWithOverrides(
  operation,
  params,
  {
    endpoint: '/v1/customers',
    method: 'GET',
    protocol: 'stripe',
    overrideEngine: apiOverrides
  }
);
```

## Rule Schema

### PII Pattern Rule

```json
{
  "id": "stripe-customer-email",
  "type": "pii_pattern",
  "pattern": {
    "field": "email",
    "context": "customers",
    "data_pattern": "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
    "type_hint": "varchar"
  },
  "classification": "pii",
  "confidence": 0.95,
  "metadata": {
    "source": "community",
    "author": "stripe-patterns",
    "created": "2025-01-15T00:00:00Z",
    "verified_by": 150,
    "description": "Email field in Stripe customers",
    "tags": ["stripe", "customer", "email"],
    "protocol_hints": ["stripe", "payment"]
  }
}
```

### API Pattern Rule

```json
{
  "id": "stripe-list-customers-pagination",
  "type": "api_pattern",
  "pattern": {
    "endpoint": "/v1/customers",
    "method": "GET",
    "parameters": ["limit", "starting_after"],
    "response": {
      "properties": ["has_more", "data"]
    }
  },
  "classification": "pagination",
  "confidence": 0.95,
  "metadata": {
    "source": "community",
    "author": "stripe-patterns",
    "created": "2025-01-15T00:00:00Z",
    "verified_by": 250,
    "description": "Stripe cursor-based pagination",
    "tags": ["stripe", "pagination", "cursor"],
    "protocol_hints": ["stripe"]
  }
}
```

## Rule Types

| Type | Purpose | Pattern Fields |
|------|---------|---------------|
| `pii_pattern` | PII detection | field, context, data_pattern, type_hint |
| `api_pattern` | API patterns | endpoint, method, parameters, response |
| `classification` | Field classification | field, context, value_pattern |
| `data_format` | Data format detection | format, regex, validator |

## Precedence System

Rules are loaded in precedence order (lowest to highest):

1. **Community** - Bundled packs in `app/overrides/community/`
2. **Organization** - Shared org repo (via `PROTO_ORG_OVERRIDES` env var)
3. **Project** - Local `.proto/overrides/` directory

Higher precedence rules override lower precedence rules with the same ID.

## Confidence Scoring

Effective confidence = Base confidence × Temporal decay + Verification boost

### Temporal Decay

| Age | Multiplier |
|-----|-----------|
| 0-30 days | 1.0 (100%) |
| 30-60 days | 0.9 (90%) |
| 60-90 days | 0.8 (80%) |
| 90+ days | 0.7 (70%) |

### Verification Boost

Each verification adds 0.5% confidence (max 10%).

```javascript
const { calculateEffectiveConfidence } = require('./core/overrides/schema');

const rule = {
  confidence: 0.9,
  metadata: {
    created: '2024-12-01T00:00:00Z',  // 30 days old
    verified_by: 100
  }
};

const effective = calculateEffectiveConfidence(rule);
// = 0.9 * 0.9 + min(100 * 0.005, 0.10) = 0.81 + 0.10 = 0.91
```

## Pattern Matching

### Field Name Matching

Supports:
- String literals (case-insensitive contains)
- Regex patterns with flags

```javascript
// String literal
{ field: "email" }  // Matches: email, customer_email, user_email

// Regex
{ field: { regex: "email|e_mail", flags: "i" } }
```

### Context Matching

Provides table/endpoint context for disambiguation:

```javascript
{
  field: "id",
  context: "customers"  // Matches customers.id, not orders.id
}
```

### Data Pattern Matching

Validates sample data against regex:

```javascript
{
  field: "email",
  data_pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"
}
```

Requires >50% of sample data to match.

### Multi-Signal Matching

Multiple signals increase confidence:

```javascript
// Field name + context + data pattern + protocol hint
const match = matcher.matchPIIPattern('email', {
  context: 'customers',
  sampleData: ['user@example.com'],
  protocol: 'stripe'
});

// Confidence boosted by corroborating signals
```

## Directory Structure

### Project Overrides

```
.proto/
└── overrides/
    ├── pii_patterns.json
    ├── api_patterns.json
    └── custom/
        ├── customers.json
        └── orders.json
```

### Rule Pack Structure

```
my-pack/
├── manifest.json
├── pii_pattern.json
├── api_pattern.json
└── classification.json
```

## Performance

- **Rule Loading**: Lazy loading on first access
- **Pattern Matching**: <5ms per field with caching
- **Cache**: LRU cache for repeated matches
- **Indexes**: Rules indexed by type for fast lookup

```javascript
// Performance monitoring
const stats = engine.getStats();
console.log(stats.cache.size);  // Number of cached matches
console.log(stats.rules.total); // Total rules loaded

// Clear cache if needed
engine.clearCache();
```

## Testing

Comprehensive test suite with 54 passing tests:

```bash
npm test -- tests/overrides/
```

Test coverage:
- Schema validation
- Rule loading & precedence
- Pattern matching
- Integration with importers
- Performance benchmarks

## Bundled Community Packs

### Stripe Pack (12 rules)

- Customer PII patterns (email, phone, address)
- Payment data patterns (card, bank account)
- API patterns (pagination, rate limiting, idempotency)

### GitHub Pack (8 rules)

- Pagination patterns (page-based, cursor-based)
- Rate limiting patterns
- Conditional requests & caching
- Webhook patterns

## API Reference

### OverrideEngine

```javascript
const engine = new OverrideEngine(projectRoot);

// Pattern matching
engine.matchPIIPattern(fieldName, options);
engine.matchAPIPattern(endpoint, method, operation);

// Detection enhancement
engine.enhanceDetection(detection, type);

// Rule creation & export
engine.createRule(detection, type, options);
engine.exportRules(filePath, options);
engine.exportPack(packName, outputDir, metadata);

// Rule loading
engine.loadRules(path, source);

// Statistics
engine.getStats();
engine.getRules();
engine.getRulesByType(type);
engine.getErrors();

// Cache management
engine.clearCache();
```

### Rule Validation

```javascript
const { validateRule } = require('./core/overrides/schema');

const result = validateRule(rule);
if (!result.valid) {
  console.error(result.errors);
}
```

### Confidence Calculation

```javascript
const {
  calculateDecay,
  calculateEffectiveConfidence,
  getPrecedence
} = require('./core/overrides/schema');

const decay = calculateDecay(createdDate);
const confidence = calculateEffectiveConfidence(rule);
const precedence = getPrecedence(source);
```

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `PROTO_ORG_OVERRIDES` | Organization override directory | None |

## Next Steps

See:
- [Validators Documentation](./validators.md) - Integration with validation system
- [B2.4 GOVERNANCE.md Generator](../missions/B2.4-governance-generator.md) - Generate community contribution guidelines
- [B2.5 Curated Seeds](../missions/B2.5-curated-seeds.md) - Pre-configured override packs with seed data

## Contributing

See B2.4 GOVERNANCE.md Generator for community contribution workflows.
