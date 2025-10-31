# Runtime Examples

This directory contains working code examples demonstrating how to use the runtime integration components effectively. Each example focuses on specific aspects of the runtime system and provides practical, runnable code.

## Examples Overview

### Core Components

- **[basic-discovery.js](./basic-discovery.js)** - Basic agent discovery using URN resolution and registry
- **[a2a-communication.js](./a2a-communication.js)** - Agent-to-Agent communication with authentication
- **[mcp-tool-execution.js](./mcp-tool-execution.js)** - MCP client tool execution and management

### Advanced Features

- **[error-handling.js](./error-handling.js)** - Comprehensive error handling with circuit breakers and retry policies
- **[logging.js](./logging.js)** - Structured logging with correlation IDs and request tracing
- **[performance.js](./performance.js)** - Performance optimization techniques and monitoring
- **[security.js](./security.js)** - Security best practices and secure communication

## Running Examples

Each example is designed to be run independently:

```bash
# Run a specific example
node basic-discovery.js

# Or make it executable and run directly
chmod +x basic-discovery.js
./basic-discovery.js
```

## Example Structure

All examples follow a consistent structure:

1. **Initialization** - Set up required components
2. **Basic Usage** - Demonstrate core functionality
3. **Advanced Features** - Show advanced capabilities
4. **Error Handling** - Demonstrate error scenarios
5. **Performance** - Show performance considerations
6. **Cleanup** - Proper resource cleanup

## Prerequisites

Before running the examples, ensure you have:

1. **Node.js** - Version 18 or higher
2. **Dependencies** - All runtime components installed
3. **Configuration** - Proper environment setup
4. **Permissions** - Required file system permissions

## Configuration

Examples use default configurations but can be customized:

```javascript
// Example configuration
const config = {
  enableLogging: true,
  enableMetrics: true,
  logLevel: 'INFO',
  timeout: 30000
};
```

## Error Handling

All examples include comprehensive error handling:

- **Try-catch blocks** for async operations
- **Error logging** with structured context
- **Graceful degradation** when components fail
- **Resource cleanup** on errors

## Performance Considerations

Examples demonstrate performance best practices:

- **Connection pooling** for database connections
- **Caching** for frequently accessed data
- **Circuit breakers** to prevent cascade failures
- **Retry policies** with exponential backoff
- **Metrics collection** for monitoring

## Security Features

Security examples cover:

- **Authentication** and authorization
- **Input validation** and sanitization
- **Rate limiting** to prevent abuse
- **CORS configuration** for web security
- **Secure error handling** without information leakage
- **Security event logging** for monitoring

## Troubleshooting

Common issues and solutions:

### Import Errors
```bash
# Ensure you're in the correct directory
cd /Users/d/portfolio/Semantext Hub/app/examples/runtime-examples

# Check module paths
node --check basic-discovery.js
```

### Permission Errors
```bash
# Make files executable
chmod +x *.js

# Check file permissions
ls -la *.js
```

### Dependency Issues
```bash
# Install dependencies
npm install

# Check for missing modules
node -e "console.log(require.resolve('./runtime/error-handler.js'))"
```

## Contributing

When adding new examples:

1. **Follow the existing structure** - Use the same format and organization
2. **Include comprehensive comments** - Explain what each section does
3. **Add error handling** - Show how to handle failures gracefully
4. **Include performance notes** - Mention performance considerations
5. **Test thoroughly** - Ensure examples work as expected
6. **Update this README** - Add new examples to the overview

## Related Documentation

- [Runtime API Reference](../docs/runtime-api-reference.md)
- [Runtime Usage Guide](../docs/runtime-usage-guide.md)
- [Runtime Integration Guide](../docs/runtime-integration-guide.md)
- [Runtime Performance Guide](../docs/runtime-performance-guide.md)
- [Runtime Security Guide](../docs/runtime-security-guide.md)

## Support

For questions or issues with the examples:

1. **Check the logs** - Look for error messages and stack traces
2. **Review the documentation** - Consult the related guides
3. **Test components individually** - Isolate the problem
4. **Check configuration** - Verify settings and environment
5. **Report issues** - Create detailed bug reports with context
