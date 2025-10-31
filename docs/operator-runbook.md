# Operator Runbook for Semantext Hub MCP Server

Mission B9.1: Performance Optimization & Hardening

## Overview

This runbook provides operational guidance for running the Semantext Hub MCP Server in production environments with performance optimization and monitoring.

## Performance Targets

- **Discovery p95**: < 1 second
- **MCP p95**: < 3 seconds  
- **Steady-state heap**: < 100 MB under 10-minute soak
- **CI pipeline**: < 5 minutes completion time

## Environment Variables

### Required
- `PROTOCOL_ROOT`: Root directory for protocol artifacts (default: `/app`)

### Optional
- `NODE_ENV`: Environment mode (`production` | `development`)
- `NODE_OPTIONS`: Node.js runtime options (default: `--max-old-space-size=256`)

## Docker Deployment

### Build Image
```bash
docker build -t ossp-agi-mcp:latest .
```

### Run Container
```bash
docker run -d \
  --name ossp-agi-mcp \
  -e PROTOCOL_ROOT=/app \
  -e NODE_ENV=production \
  -v /path/to/protocols:/app \
  ossp-agi-mcp:latest
```

### Docker Compose
```yaml
version: '3.8'
services:
  ossp-agi-mcp:
    build: .
    environment:
      - NODE_ENV=production
      - PROTOCOL_ROOT=/app
    volumes:
      - ./protocols:/app
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "console.log('Health check passed')"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Performance Monitoring

### Metrics Endpoint
Access performance metrics via the MCP resource:
```
metrics://performance
```

### Key Metrics to Monitor
- **Request Latency**: p50, p95, p99 percentiles
- **Memory Usage**: Heap usage, RSS, external memory
- **Cache Performance**: Hit ratio, cache size
- **Request Throughput**: Requests per second
- **Error Rates**: Failed requests, success rate

### Performance Compliance
Monitor compliance against targets:
- Discovery p95 < 1000ms
- MCP p95 < 3000ms
- Heap usage < 100MB

### Metrics Logging Configuration
- Performance summaries persist to `var/log/mcp/performance-metrics.jsonl` by default.
- Control behavior with environment variables:
  - `MCP_METRICS_LOG_MODE`: `file` (default), `stdout`, or `off`
  - `MCP_METRICS_LOG_FILE`: override summary file location
  - `MCP_METRICS_LOG_INTERVAL_MS`: summary interval in milliseconds (default `300000`)
- Use `tail -f var/log/mcp/performance-metrics.jsonl` during development instead of relying on stdout logs.

## Memory Management

### Heap Size Limits
- **Production**: 256MB max (`--max-old-space-size=256`)
- **Development**: 512MB max (`--max-old-space-size=512`)

### Memory Optimization Features
- Automatic garbage collection monitoring
- Memory usage alerts at 80% threshold
- LRU cache eviction for URN resolution
- Request batching to reduce memory pressure

## Caching Configuration

### URN Resolver Cache
- **TTL**: 5 minutes (300,000ms)
- **Max Size**: 1000 entries
- **Eviction**: LRU (Least Recently Used)

### ProtocolGraph Cache
- **TTL**: 5 minutes
- **Max Size**: 1000 entries
- **Eviction**: LRU

### Cache Warming
Common URNs are pre-warmed on startup:
- `urn:agent:system:registry@1.0.0`
- `urn:agent:system:discovery@1.0.0`
- `urn:agent:system:validation@1.0.0`

## Logging Configuration

### Log Levels
- **Production**: `INFO` level, console output only
- **Development**: `DEBUG` level, detailed performance logs

### Log Format
Structured JSON logging with:
- Timestamp
- Correlation ID
- Component name
- Operation type
- Latency metrics
- Success/failure status

### Performance Logs
- Request latency tracking
- Cache hit/miss ratios
- Memory usage warnings
- Performance compliance status

## Troubleshooting

### High Memory Usage
1. Check heap usage via metrics endpoint
2. Monitor for memory leaks in long-running processes
3. Verify cache size limits are appropriate
4. Consider increasing `max-old-space-size` if needed

### Slow Response Times
1. Check latency percentiles in metrics
2. Verify cache hit ratios (>95% target)
3. Monitor URN resolution performance
4. Check for blocking operations in tool handlers

### Cache Performance Issues
1. Monitor cache hit ratio (target >95%)
2. Check cache size vs. usage patterns
3. Verify TTL settings are appropriate
4. Consider pre-warming additional URNs

### Discovery Performance
1. Monitor discovery p95 latency (target <1s)
2. Check URN resolver cache performance
3. Verify agent resolution optimization
4. Monitor batch operation efficiency

### MCP Performance
1. Monitor MCP p95 latency (target <3s)
2. Check tool execution performance
3. Verify request batching effectiveness
4. Monitor workflow execution times

## Scaling Considerations

### Horizontal Scaling
- MCP server is stateless
- Use load balancer for multiple instances
- Share protocol artifacts via shared storage
- Monitor aggregate performance metrics

### Vertical Scaling
- Increase `max-old-space-size` for larger heaps
- Adjust cache sizes based on usage patterns
- Monitor CPU usage for optimization opportunities
- Consider request batching for high throughput

## Security Considerations

### Container Security
- Run as non-root user (`ossp:nodejs`)
- Use minimal Alpine Linux base image
- Scan images for vulnerabilities
- Limit container capabilities

### Runtime Security
- Validate all input paths (path traversal protection)
- Use structured logging (no sensitive data)
- Monitor for unusual request patterns
- Implement rate limiting if needed

## Backup and Recovery

### Protocol Artifacts
- Backup `PROTOCOL_ROOT` directory regularly
- Include catalog index and manifests
- Test restoration procedures
- Monitor backup integrity

### Configuration
- Version control all configuration changes
- Document environment variable changes
- Test configuration updates in staging
- Maintain rollback procedures

## Maintenance

### Regular Tasks
- Monitor performance metrics daily
- Review cache hit ratios weekly
- Check memory usage trends monthly
- Update dependencies quarterly

### Performance Tuning
- Adjust cache sizes based on usage
- Optimize URN resolution patterns
- Tune garbage collection settings
- Monitor and optimize slow queries

### Updates
- Test performance impact of updates
- Monitor metrics after deployments
- Rollback if performance degrades
- Document performance changes

## Emergency Procedures

### High Memory Usage
1. Check metrics endpoint for current usage
2. Restart container if heap >200MB
3. Investigate memory leaks
4. Consider temporary cache size reduction

### Performance Degradation
1. Check latency percentiles
2. Verify cache performance
3. Restart services if needed
4. Investigate root cause

### Service Unavailability
1. Check container health status
2. Review logs for errors
3. Restart container
4. Escalate if issues persist

## Contact Information

- **Team**: Semantext Hub Team
- **Mission**: B9.1 Performance Optimization & Hardening
- **Version**: 0.1.0
- **Last Updated**: 2025-01-09
