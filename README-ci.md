# CI/CD Runbook

## Overview

This document provides operational guidance for the OSSP-AGI CI/CD pipeline.

## Pipeline Structure

The CI pipeline consists of 2 consolidated jobs:

1. **build_test** - Build, Test & Security (4 min timeout)
2. **docker_image** - Docker Build & Test (3 min timeout)

Total pipeline target: < 5 minutes

## Key Configuration

### Working Directory
All Node.js operations run in `/app` directory:
- `working-directory: ./app` for all npm commands
- Cache key uses `app/package-lock.json`

### Docker Build
- Context: `./app`
- Dockerfile: `app/Dockerfile`
- Command: `docker build -f app/Dockerfile ./app -t ossp-agi-mcp:latest`

## Performance Targets

- Discovery p95 < 1s
- MCP p95 < 3s
- Heap usage < 100MB
- Total CI time < 5 minutes

## Troubleshooting

### Common Issues

1. **Docker build fails**
   - Check Dockerfile path: `app/Dockerfile`
   - Verify build context: `./app`
   - Ensure `.dockerignore` excludes unnecessary files

2. **Tests timeout**
   - Check test configuration in `jest.config.js`
   - Verify test scripts in `package.json`
   - Review performance benchmarks

3. **Cache issues**
   - Clear npm cache: `npm cache clean --force`
   - Verify `app/package-lock.json` exists
   - Check cache dependency path configuration

### Debug Commands

```bash
# Local testing
cd app
npm ci
npm run test:ci
npm run test:performance

# Docker testing
docker build -f app/Dockerfile ./app -t ossp-agi-mcp:latest
docker run --rm -it ossp-agi-mcp:latest

# Performance check
node packages/runtime/scripts/performance-benchmark.js
```

## Monitoring

- Pipeline status: GitHub Actions tab
- Performance results: Check artifacts
- Docker image health: Container logs
- Security: npm audit results

## Maintenance

- Update Node.js versions in matrix
- Review timeout values quarterly
- Monitor performance trends
- Update dependencies regularly
