# OpenAPI Parser

Production-ready OpenAPI 3.x parser with streaming capabilities, deterministic hashing, and protocol manifest conversion.

## Features

### Core Features (B7.1.0)
- 🚀 **High Performance**: Parse 10k line specs in ~400ms
- 📦 **Streaming Support**: Handle large files without memory issues
- 🔒 **Deterministic Hashing**: XXHash64 for consistent content hashing
- 🔄 **Protocol Conversion**: Convert OpenAPI specs to Protocol manifests
- ✅ **Full Metadata**: Extract endpoints, schemas, parameters, and more
- 🎯 **95%+ Accuracy**: Comprehensive endpoint and schema extraction

### Enhanced Features (B7.1.1) ✨
- 🌐 **External $refs**: Resolve HTTP/HTTPS/file:// references with caching
- 🔁 **Circular Detection**: Graph-based circular reference detection
- 📝 **Structured Errors**: 30+ error codes with severity levels
- 📊 **Progress Tracking**: Real-time progress events for long operations
- 🛡️ **Error Recovery**: Collect errors and return partial results
- 🔄 **Retry Logic**: Exponential backoff for network failures

## Quick Start

```javascript
import { OpenAPIParser } from './parsers/openapi-parser.js';

// Create parser
const parser = new OpenAPIParser();

// Parse from file
const result = await parser.parse('./spec.json');

// Extract endpoints
const endpoints = parser.extractEndpoints();

// Extract schemas
const schemas = parser.extractSchemas();

// Get deterministic hash
const hash = parser.getSpecHash();

// Convert to Protocol manifest
const manifest = parser.toProtocolManifest();
```

## Parsing Options

```javascript
const parser = new OpenAPIParser({
  // Core options
  streaming: true,        // Enable streaming for large files
  resolveRefs: 'all',     // 'local' | 'all' | 'none'
  validateSpec: true,     // Validate OpenAPI structure
  generateHash: true,     // Generate deterministic hash
  strictMode: false,      // Fail on any errors

  // B7.1.1: External ref resolution
  refCache: true,         // Cache external refs
  maxRefDepth: 10,        // Prevent infinite resolution
  refTimeout: 5000,       // External ref fetch timeout (ms)
  maxRetries: 3,          // Retry failed external refs

  // B7.1.1: Circular detection
  detectCircular: true,   // Enable circular ref detection
  allowCircular: false,   // Fail or warn on circular refs

  // B7.1.1: Error handling
  errorMode: 'collect',   // 'throw' | 'collect' | 'ignore'
  maxErrors: 100,         // Max errors to collect
  maxWarnings: 200,       // Max warnings to collect

  // B7.1.1: Progress tracking
  progressTracking: false // Emit progress events (opt-in)
});
```

## Performance Targets

| Operation | Target | Actual |
|-----------|--------|--------|
| Parse 10k lines | < 1s | ~400ms |
| Hash 1k lines | < 100ms | ~30ms |
| Extract endpoints | 95% | ~98% |
| Memory usage | < 50MB | ~15MB |

## Supported Input Types

- **File paths**: `/path/to/spec.json`
- **URLs**: `https://api.example.com/openapi.json`
- **Objects**: JavaScript objects
- **JSON strings**: Stringified JSON
- **Streams**: Node.js Readable streams
- **Buffers**: Buffer objects

## Architecture

```
OpenAPIParser (main)
├── StreamParser            - Streaming JSON parsing
├── EndpointExtractor       - Extract API endpoints
├── SchemaExtractor         - Extract schemas with $refs
├── RefResolver             - Local $ref resolution
├── HashGenerator           - XXHash64 hashing
├── ManifestConverter       - Protocol manifest output
└── B7.1.1 Components:
    ├── ExternalRefResolver - HTTP/HTTPS/file:// resolution
    ├── CircularRefDetector - Graph-based cycle detection
    ├── ErrorCollector      - Structured error collection
    └── ProgressTracker     - Event-based progress tracking
```

## Examples

### Parse from different sources

```javascript
// From file
await parser.parse('./openapi.json');

// From URL
await parser.parse('https://api.example.com/openapi.json');

// From object
await parser.parse({
  openapi: '3.0.0',
  info: { title: 'My API', version: '1.0.0' },
  paths: { ... }
});

// From stream
const stream = fs.createReadStream('./large-spec.json');
await parser.parseStream(stream);
```

### Extract specific components

```javascript
await parser.parse('./spec.json');

// Get all endpoints
const endpoints = parser.extractEndpoints();
// Returns: [{ method: 'GET', path: '/users', ... }, ...]

// Get all schemas
const schemas = parser.extractSchemas();
// Returns: [{ name: 'User', type: 'object', ... }, ...]

// Generate hash
const hash = parser.generateSpecHash();
// Returns: "a1b2c3d4e5f6g7h8"
```

### Convert to Protocol manifest

```javascript
const manifest = parser.toProtocolManifest();

console.log(manifest);
// {
//   service: { name: 'My API', version: '1.0.0', urn: '...' },
//   interface: {
//     endpoints: [...],
//     authentication: { type: 'apiKey', ... }
//   },
//   validation: { schemas: {...} },
//   provenance: { parser: 'OpenAPIParser', ... }
// }
```

## Error Handling (B7.1.1) ✨

```javascript
// Error collection mode (recommended)
const parser = new OpenAPIParser({
  errorMode: 'collect',  // Collect all errors
  maxErrors: 100
});

const result = await parser.parse('./spec.json');

// Check for errors and warnings
if (result.hasErrors) {
  console.log(`Found ${result.errors.length} errors:`);
  result.errors.forEach(err => {
    console.log(`[${err.code}] ${err.message}`);
    console.log(`  Suggestion: ${err.suggestion}`);
  });
}

// Structured error codes
result.errors.forEach(error => {
  switch(error.code) {
    case 'REF_001':
      // Handle external ref failure
      break;
    case 'REF_002':
      // Handle circular reference
      break;
    // ... handle other codes
  }
});

// Strict mode: throws on first error
const strictParser = new OpenAPIParser({
  errorMode: 'throw',
  strictMode: true
});

try {
  await strictParser.parse(invalidSpec);
} catch (error) {
  console.error(`[${error.code}] ${error.message}`);
}
```

See [ERROR_CODES.md](../../docs/ERROR_CODES.md) for complete error code reference.

## Progress Tracking (B7.1.1) ✨

```javascript
const parser = new OpenAPIParser({
  progressTracking: true  // Enable progress events
});

const tracker = parser.getProgressTracker();

// Listen to progress events
tracker.on('progress', (data) => {
  console.log(`${data.stageLabel}: ${data.overallProgress.toFixed(1)}%`);
});

tracker.on('stage-complete', (data) => {
  console.log(`✓ ${data.stageLabel} (${data.duration}ms)`);
});

tracker.on('complete', (data) => {
  console.log(`✅ Parsing complete in ${data.duration}ms`);
});

await parser.parse('./large-spec.json');
```

## Circular Reference Handling (B7.1.1) ✨

```javascript
// Detect and allow circular refs
const parser = new OpenAPIParser({
  detectCircular: true,
  allowCircular: true
});

const result = await parser.parse('./spec-with-cycles.json');

// Check for circular references
if (result.metadata.hasCircularRefs) {
  console.log('Circular references detected:');
  result.circularRefs.forEach(cycle => {
    console.log(`  ${cycle.description}`);
  });
}
```

## Limitations

- **OpenAPI 3.x only**: Does not support Swagger 2.0 (yet)
- **No AsyncAPI support**: AsyncAPI specs handled by separate parser

## Testing

```bash
# Run all tests
npm test -- tests/parsers/

# Run specific test file
npm test -- tests/parsers/openapi-parser.test.js

# Run with coverage
npm test -- tests/parsers/ --coverage

# Run performance benchmarks
npm test -- tests/parsers/performance.test.js
```

## API Reference

### OpenAPIParser

#### Constructor
```javascript
new OpenAPIParser(options)
```

#### Methods
- `parse(source)` - Parse OpenAPI spec from any source
- `parseStream(stream)` - Parse from stream
- `extractEndpoints(spec?)` - Extract all endpoints
- `extractSchemas(spec?)` - Extract all schemas
- `generateSpecHash(spec)` - Generate deterministic hash
- `toProtocolManifest(spec?)` - Convert to Protocol manifest
- `getParsedSpec()` - Get cached parsed spec
- `getSpecHash()` - Get cached hash
- `clear()` - Clear cached data

### Utility Classes

All utility classes can be used independently:

```javascript
import { StreamParser } from './parsers/utils/stream-parser.js';
import { EndpointExtractor } from './parsers/utils/endpoint-extractor.js';
import { SchemaExtractor } from './parsers/utils/schema-extractor.js';
import { RefResolver } from './parsers/utils/ref-resolver.js';
import { HashGenerator } from './parsers/utils/hash-generator.js';
import { ManifestConverter } from './parsers/utils/manifest-converter.js';
```

## Contributing

See mission file: `missions/current.md` (B7.1.0)

## License

Part of the OSSP-AGI project.
