# OpenAPI Parser Error Codes

Comprehensive reference for all error codes emitted by the OpenAPI parser (B7.1.1).

## Error Code Format

Error codes follow the pattern `DOMAIN_NNN` where:
- **DOMAIN**: Error category (OPENAPI, REF, SCHEMA, NET, PARSE, GENERAL)
- **NNN**: Sequential number within domain (001-999)

## Severity Levels

- **ERROR**: Blocks parsing, unrecoverable without user intervention
- **WARN**: Parsing continues, may affect quality or completeness
- **INFO**: Advisory only, parsing unaffected

## Error Domains

### OPENAPI (100-199) - Spec Validation Errors

| Code | Severity | Message | Recoverable | Suggestion |
|------|----------|---------|-------------|------------|
| **OPENAPI_001** | ERROR | Invalid or unsupported OpenAPI version | No | Ensure OpenAPI version is 3.0.x or 3.1.x |
| **OPENAPI_002** | ERROR | Missing required field | No | Add the required field according to OpenAPI specification |
| **OPENAPI_003** | ERROR | Invalid spec structure | No | Validate spec against OpenAPI JSON Schema |
| **OPENAPI_004** | WARN | Deprecated field usage | Yes | Update to use current OpenAPI 3.x fields |

---

### REF (200-299) - Reference Resolution Errors

| Code | Severity | Message | Recoverable | Suggestion |
|------|----------|---------|-------------|------------|
| **REF_001** | ERROR | External reference resolution failed | Yes | Check that the external resource is accessible |
| **REF_002** | WARN | Circular reference detected | Yes | Enable allowCircular option or refactor schema to break cycle |
| **REF_003** | ERROR | Invalid reference URI format | No | Ensure $ref follows RFC 3986 URI format |
| **REF_004** | ERROR | Reference target not found | No | Verify the reference path points to an existing component |
| **REF_005** | ERROR | Maximum reference depth exceeded | No | Reduce reference nesting or increase maxRefDepth option |
| **REF_006** | ERROR | Relative reference resolution failed | Yes | Ensure base URL is correctly configured |
| **REF_007** | ERROR | External reference timeout | Yes | Increase timeout or check network connectivity |

---

### SCHEMA (300-399) - Schema Validation Errors

| Code | Severity | Message | Recoverable | Suggestion |
|------|----------|---------|-------------|------------|
| **SCHEMA_001** | ERROR | Invalid schema definition | No | Validate schema against JSON Schema Draft 7 or OAS 3.1 |
| **SCHEMA_002** | WARN | Unsupported schema feature | Yes | Some schema features may not be fully supported |
| **SCHEMA_003** | ERROR | Schema composition error (allOf/oneOf/anyOf) | No | Check schema composition for conflicts |
| **SCHEMA_004** | ERROR | Discriminator mapping error | No | Verify discriminator property exists in all schema variants |

---

### NET (400-499) - Network Errors

| Code | Severity | Message | Recoverable | Suggestion |
|------|----------|---------|-------------|------------|
| **NET_001** | ERROR | Network request timeout | Yes | Check network connectivity and increase timeout if needed |
| **NET_002** | ERROR | Connection refused | Yes | Verify the remote server is accessible and running |
| **NET_003** | ERROR | TLS/SSL certificate error | Yes | Verify SSL certificate or use rejectUnauthorized option |
| **NET_004** | ERROR | HTTP error response | Yes | Check HTTP status code and response body for details |
| **NET_005** | ERROR | DNS resolution failed | Yes | Verify hostname is correct and DNS is functional |
| **NET_006** | ERROR | Maximum redirects exceeded | Yes | Check for redirect loops or increase maxRedirects |

---

### PARSE (500-599) - Parsing Errors

| Code | Severity | Message | Recoverable | Suggestion |
|------|----------|---------|-------------|------------|
| **PARSE_001** | ERROR | JSON/YAML syntax error | No | Fix syntax errors in the OpenAPI specification |
| **PARSE_002** | ERROR | Character encoding error | No | Ensure file is UTF-8 encoded |
| **PARSE_003** | ERROR | File not found | No | Verify file path is correct and file exists |
| **PARSE_004** | ERROR | File read permission denied | No | Check file permissions |
| **PARSE_005** | ERROR | Stream processing error | No | Check stream source and format |
| **PARSE_006** | ERROR | Memory limit exceeded | No | Increase memory allocation or use streaming mode |

---

### GENERAL (600-699) - General Errors

| Code | Severity | Message | Recoverable | Suggestion |
|------|----------|---------|-------------|------------|
| **GENERAL_001** | ERROR | Unknown error occurred | No | Check logs for more details |
| **GENERAL_002** | INFO | Operation cancelled by user | Yes | None |
| **GENERAL_003** | WARN | Feature not implemented | Yes | This feature is planned for a future release |

---

## Usage Examples

### Accessing Error Information

```javascript
import { OpenAPIParser } from './parsers/openapi-parser.js';

const parser = new OpenAPIParser({
  errorMode: 'collect' // Collect errors instead of throwing
});

const result = await parser.parse('./api-spec.json');

// Check for errors
if (result.hasErrors) {
  console.log(`Found ${result.errors.length} errors:`);

  result.errors.forEach(error => {
    console.log(`[${error.code}] ${error.message}`);
    console.log(`  Severity: ${error.severity}`);
    console.log(`  Path: ${error.path}`);
    console.log(`  Suggestion: ${error.suggestion}`);
  });
}

// Check for warnings
if (result.hasWarnings) {
  console.log(`Found ${result.warnings.length} warnings:`);

  result.warnings.forEach(warning => {
    console.log(`[${warning.code}] ${warning.message}`);
  });
}
```

### Filtering Errors by Domain

```javascript
import { getErrorsByDomain } from './parsers/utils/error-codes.js';

// Get all reference-related error codes
const refErrors = getErrorsByDomain('REF');

console.log('Reference error codes:');
refErrors.forEach(error => {
  console.log(`- ${error.code}: ${error.message}`);
});
```

### Filtering Errors by Severity

```javascript
import { getErrorsBySeverity } from './parsers/utils/error-codes.js';

// Get all fatal errors
const fatalErrors = getErrorsBySeverity('ERROR');

console.log('Fatal error codes:');
fatalErrors.forEach(error => {
  console.log(`- ${error.code}: ${error.message}`);
});
```

### Error Context

Each error includes contextual information:

```javascript
{
  code: 'REF_004',
  message: 'Reference target not found',
  severity: 'ERROR',
  path: '#/components/schemas/User',
  location: { line: 42, column: 10 },
  recoverable: false,
  suggestion: 'Verify the reference path points to an existing component',
  metadata: {
    ref: '#/components/schemas/User',
    originalError: { /* ... */ }
  },
  timestamp: '2025-10-06T...'
}
```

---

## Error Recovery Strategies

### Recoverable Errors

Errors marked as `recoverable: true` allow parsing to continue:

```javascript
const parser = new OpenAPIParser({
  errorMode: 'collect',    // Collect errors instead of throwing
  maxRetries: 3,           // Retry failed external refs
  allowCircular: true      // Continue despite circular refs
});
```

### Non-Recoverable Errors

Errors marked as `recoverable: false` indicate critical issues:

```javascript
const parser = new OpenAPIParser({
  errorMode: 'throw',      // Throw on first error
  strictMode: true         // Fail fast
});

try {
  const result = await parser.parse('./spec.json');
} catch (error) {
  if (error.code === 'PARSE_003') {
    console.error('File not found:', error.path);
  }
}
```

---

## Best Practices

1. **Always check `hasErrors`** before using parsed results
2. **Log warnings** for potential issues that don't block parsing
3. **Use error codes** for programmatic error handling
4. **Review suggestions** for guidance on fixing errors
5. **Enable error collection mode** for comprehensive error reporting
6. **Check `recoverable` flag** to determine if partial results are usable

---

## Related Documentation

- [Parser Guide](./PARSER_GUIDE.md) - Complete parser usage guide
- [API Reference](../parsers/README.md) - Full API documentation
- [Error Model Source](../parsers/utils/error-codes.js) - Error code definitions

---

*Last Updated: October 6, 2025*
*Mission: B7.1.1 - Parser Extensions & Error Model*
