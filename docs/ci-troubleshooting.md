# CI Troubleshooting Guide

## Overview

This guide helps troubleshoot issues with the Runtime Integration CI Gate workflow. The CI gate ensures that runtime integration remains stable and prevents regressions in the A2A/MCP/discovery/E2E workflow through automated testing.

## CI Workflow Components

### 1. Runtime Integration Tests
- **Unit Tests**: Core runtime components (A2A client, MCP client, discovery)
- **Integration Tests**: Cross-component communication and workflows
- **E2E Tests**: Complete multi-agent execution scenarios

### 2. Component-Specific Tests
- **A2A Tests**: Agent-to-agent HTTP communication
- **MCP Tests**: Model Context Protocol client integration
- **Discovery Tests**: Agent discovery and URN resolution
- **E2E Tests**: Multi-agent end-to-end validation

### 3. Performance Validation
- **Benchmarks**: Performance target validation
- **Memory Usage**: Memory consumption monitoring
- **Latency Tests**: Response time validation

### 4. Quality Gates
- **Coverage Thresholds**: Minimum test coverage requirements
- **Regression Prevention**: Block merges on failing tests
- **Artifact Collection**: Failure artifact export for triage

## Common Issues and Solutions

### 1. Test Failures

#### Unit Test Failures
```bash
# Run unit tests locally
cd app
npm test -- --testPathPattern="tests/runtime|tests/core|tests/validation" --verbose

# Check specific test file
npm test -- tests/runtime/a2a-client.test.js --verbose
```

**Common Causes:**
- Missing dependencies
- Environment variable issues
- Mock configuration problems
- Test data corruption

**Solutions:**
1. Clear Jest cache: `npm test -- --clearCache`
2. Reinstall dependencies: `rm -rf node_modules && npm ci`
3. Check environment variables: `echo $NODE_ENV`
4. Verify test data: `node test-infrastructure/index.js generate-fixtures`

#### Integration Test Failures
```bash
# Run integration tests locally
cd app
npm test -- --testPathPattern="tests/integration" --verbose

# Run specific integration test
npm test -- tests/integration/agent-full-suite.test.js --verbose
```

**Common Causes:**
- Service dependencies not available
- Network connectivity issues
- Database connection problems
- Port conflicts

**Solutions:**
1. Check service status: `docker ps` or `systemctl status postgresql`
2. Verify network connectivity: `ping localhost`
3. Check database connection: `psql -h localhost -U postgres -d test_db`
4. Verify port availability: `netstat -tulpn | grep :5432`

#### E2E Test Failures
```bash
# Run E2E tests locally
cd app
npm test -- --testPathPattern="tests/e2e" --verbose

# Run E2E validation
node scripts/validate-e2e-workflow.js --verbose
```

**Common Causes:**
- Multi-agent coordination issues
- Timeout problems
- Resource exhaustion
- Configuration mismatches

**Solutions:**
1. Increase timeout: `export CI_TIMEOUT=10m`
2. Check resource usage: `free -h` and `df -h`
3. Verify configuration: `node examples/multi-agent-e2e-demo.js --verbose`
4. Check logs: `tail -f app/runtime/*.log`

### 2. Performance Issues

#### Slow Test Execution
```bash
# Check performance benchmarks
cd app
node scripts/benchmark-e2e-performance.js --verbose
```

**Common Causes:**
- Resource constraints
- Network latency
- Database performance
- Memory leaks

**Solutions:**
1. Monitor resources: `htop` or `top`
2. Check network: `ping -c 5 localhost`
3. Optimize database: `VACUUM ANALYZE;`
4. Check memory usage: `node -e "console.log(process.memoryUsage())"`

#### Memory Issues
```bash
# Check memory usage
cd app
node -e "
const usage = process.memoryUsage();
console.log('Memory Usage:', {
  rss: Math.round(usage.rss / 1024 / 1024) + ' MB',
  heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + ' MB',
  heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + ' MB'
});
"
```

**Common Causes:**
- Memory leaks in tests
- Large test data sets
- Inefficient algorithms
- Resource not released

**Solutions:**
1. Check for leaks: `node --inspect-brk test.js`
2. Reduce test data: Use smaller fixtures
3. Optimize algorithms: Profile performance
4. Ensure cleanup: `afterEach()` and `afterAll()` hooks

### 3. A2A Communication Issues

#### A2A Client Failures
```bash
# Test A2A client locally
cd app
node -e "
import { createA2AClient } from './runtime/a2a-client.js';
const client = createA2AClient();
console.log('A2A Client created successfully');
"
```

**Common Causes:**
- Authentication failures
- Network connectivity issues
- Invalid URNs
- Timeout problems

**Solutions:**
1. Check authentication: `echo $A2A_TOKEN`
2. Verify network: `curl -I http://localhost:3000`
3. Validate URNs: `node -e "console.log('urn:agent:test:agent@1.0.0')"`
4. Increase timeout: `export A2A_TIMEOUT=60000`

#### A2A Integration Issues
```bash
# Run A2A integration tests
cd app
npm test -- --testPathPattern="tests/integration.*a2a" --verbose
```

**Common Causes:**
- Service discovery failures
- Protocol mismatches
- Authentication delegation issues
- Circuit breaker activation

**Solutions:**
1. Check service discovery: `node runtime/agent-discovery-service.js --test`
2. Verify protocols: Check ACM manifests
3. Test authentication: `node runtime/a2a-auth.js --test`
4. Check circuit breaker: `node runtime/circuit-breaker.js --status`

### 4. MCP Client Issues

#### MCP Client Failures
```bash
# Test MCP client locally
cd app
node -e "
import { createMCPClient } from './runtime/mcp-client.js';
const client = createMCPClient();
console.log('MCP Client created successfully');
"
```

**Common Causes:**
- Connection failures
- Tool execution errors
- Protocol version mismatches
- Resource exhaustion

**Solutions:**
1. Check connection: `telnet localhost 3001`
2. Verify tools: `node runtime/mcp-client.js --list-tools`
3. Check protocol version: `node runtime/mcp-types.js --version`
4. Monitor resources: `htop`

#### MCP Integration Issues
```bash
# Run MCP integration tests
cd app
npm test -- --testPathPattern="tests/integration.*mcp" --verbose
```

**Common Causes:**
- Tool availability issues
- Execution timeouts
- Resource conflicts
- Error handling problems

**Solutions:**
1. Check tool availability: `node runtime/mcp-client.js --test-tools`
2. Increase timeouts: `export MCP_TIMEOUT=60000`
3. Check resources: `free -h`
4. Test error handling: `node runtime/error-handler.js --test`

### 5. Discovery Issues

#### Agent Discovery Failures
```bash
# Test agent discovery locally
cd app
node -e "
import { createAgentDiscoveryService } from './runtime/agent-discovery-service.js';
const service = createAgentDiscoveryService();
console.log('Agent Discovery Service created successfully');
"
```

**Common Causes:**
- URN resolution failures
- Registry connectivity issues
- ACM validation problems
- Well-known server issues

**Solutions:**
1. Check URN resolution: `node runtime/urn-resolver.js --test`
2. Verify registry: `node runtime/registry-api.js --status`
3. Validate ACMs: `node runtime/acm-generator.js --validate`
4. Check well-known server: `curl http://localhost:3000/.well-known/agent`

#### Discovery Integration Issues
```bash
# Run discovery integration tests
cd app
npm test -- --testPathPattern="tests/integration.*discovery" --verbose
```

**Common Causes:**
- Registry synchronization issues
- URN conflict detection problems
- ACM generation failures
- Well-known server configuration issues

**Solutions:**
1. Check registry sync: `node runtime/registry-api.js --sync-status`
2. Test URN conflicts: `node runtime/urn-registry.js --test-conflicts`
3. Validate ACM generation: `node runtime/acm-generator.js --test`
4. Check well-known config: `node runtime/well-known-server.js --config`

### 6. Artifact Collection Issues

#### Artifact Export Failures
```bash
# Test artifact exporter locally
cd app
node scripts/ci-artifact-exporter.js --verbose
```

**Common Causes:**
- Permission issues
- Disk space problems
- File system errors
- Network connectivity issues

**Solutions:**
1. Check permissions: `ls -la app/artifacts/`
2. Check disk space: `df -h`
3. Verify file system: `fsck /dev/sda1`
4. Test network: `ping -c 5 github.com`

#### Artifact Collection Problems
```bash
# Collect specific artifacts
cd app
node scripts/ci-artifact-exporter.js --collect-failures --verbose
node scripts/ci-artifact-exporter.js --collect-a2a --verbose
node scripts/ci-artifact-exporter.js --collect-mcp --verbose
```

**Common Causes:**
- Missing artifact directories
- Corrupted artifact files
- Insufficient disk space
- Network upload failures

**Solutions:**
1. Create artifact directories: `mkdir -p app/artifacts/{failures,a2a,mcp,discovery,e2e,performance}`
2. Check file integrity: `md5sum app/artifacts/*`
3. Free up disk space: `du -sh app/artifacts/*`
4. Test upload: `curl -T test.txt https://github.com`

## Debugging Commands

### 1. Environment Check
```bash
# Check Node.js version
node --version

# Check npm version
npm --version

# Check environment variables
env | grep -E "(NODE|A2A|MCP|DISCOVERY)"

# Check system resources
free -h
df -h
```

### 2. Service Status
```bash
# Check running services
ps aux | grep -E "(node|postgres|redis)"

# Check port usage
netstat -tulpn | grep -E ":(3000|3001|5432|6379)"

# Check service logs
tail -f /var/log/syslog | grep -E "(node|postgres|redis)"
```

### 3. Test Execution
```bash
# Run tests with verbose output
cd app
npm test -- --verbose --detectOpenHandles

# Run specific test suite
npm test -- --testPathPattern="tests/runtime" --verbose

# Run tests with coverage
npm test -- --coverage --verbose

# Run tests in watch mode
npm test -- --watch --verbose
```

### 4. Performance Monitoring
```bash
# Monitor CPU usage
top -p $(pgrep node)

# Monitor memory usage
ps aux | grep node | awk '{print $6/1024 " MB"}'

# Monitor network usage
iftop -i lo

# Monitor disk usage
iotop
```

## CI Workflow Debugging

### 1. GitHub Actions Debugging
```bash
# Enable debug logging
export ACTIONS_STEP_DEBUG=true
export ACTIONS_RUNNER_DEBUG=true

# Check workflow status
gh run list --limit 10

# View workflow logs
gh run view <run-id> --log
```

### 2. Local CI Simulation
```bash
# Simulate CI environment
export CI=true
export NODE_ENV=test
export A2A_TOKEN=test-token
export MCP_TOKEN=test-token

# Run CI workflow locally
cd app
npm ci
npm test -- --coverage --watchAll=false
node scripts/validate-e2e-workflow.js
node scripts/ci-artifact-exporter.js --verbose
```

### 3. Artifact Inspection
```bash
# List collected artifacts
ls -la app/artifacts/

# Inspect artifact contents
cat app/artifacts/ci-artifact-summary.json

# Check artifact sizes
du -sh app/artifacts/*

# Verify artifact integrity
md5sum app/artifacts/*
```

## Performance Optimization

### 1. Test Optimization
```bash
# Run tests in parallel
npm test -- --maxWorkers=4

# Use test cache
npm test -- --cache

# Skip slow tests
npm test -- --testPathIgnorePatterns="tests/performance"

# Use test sharding
npm test -- --shard=1/4
```

### 2. Resource Optimization
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Optimize garbage collection
export NODE_OPTIONS="--gc-interval=100"

# Use worker threads
export NODE_OPTIONS="--experimental-worker"
```

### 3. Network Optimization
```bash
# Use local registry
npm config set registry http://localhost:4873

# Enable npm cache
npm config set cache-max 1000000000

# Use connection pooling
export A2A_POOL_SIZE=10
export MCP_POOL_SIZE=10
```

## Best Practices

### 1. Test Development
- Write focused, isolated tests
- Use proper mocking and stubbing
- Implement proper cleanup in tests
- Follow AAA pattern (Arrange, Act, Assert)

### 2. CI Configuration
- Keep CI workflows simple and focused
- Use appropriate timeouts and retries
- Implement proper error handling
- Collect relevant artifacts for debugging

### 3. Performance Monitoring
- Monitor CI execution times
- Track resource usage patterns
- Implement performance budgets
- Use performance regression detection

### 4. Error Handling
- Implement comprehensive error logging
- Use structured error messages
- Provide actionable error information
- Implement proper error recovery

## Getting Help

### 1. Documentation
- Check this troubleshooting guide
- Review CI workflow documentation
- Consult runtime integration README
- Check test infrastructure docs

### 2. Logs and Artifacts
- Check CI workflow logs
- Inspect collected artifacts
- Review test output
- Analyze performance metrics

### 3. Community Support
- Check GitHub issues
- Review pull request discussions
- Consult team documentation
- Ask for help in team channels

### 4. Escalation
- If issues persist, escalate to team lead
- Provide detailed error information
- Include relevant logs and artifacts
- Describe troubleshooting steps taken
