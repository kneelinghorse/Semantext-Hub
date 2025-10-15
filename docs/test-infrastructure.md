# Test Infrastructure & CI/CD Pipeline

Mission B7.6.0 - Comprehensive test infrastructure and CI/CD pipeline for protocol discovery.

## Overview

The test infrastructure provides automated testing, quality assurance, and continuous integration for the OSSP-AGI protocol suite. It includes contract testing, performance benchmarks, property-based testing, and comprehensive CI/CD workflows.

## Components

### 1. Test Infrastructure Core (`test-infrastructure/`)

#### TestFixturesGenerator
- Generates synthetic test data for all protocol types
- Creates fixtures for OpenAPI, AsyncAPI, manifests, workflows, agents, data, events, and semantic protocols
- Supports both minimal and complex test scenarios

```bash
# Generate all test fixtures
node test-infrastructure/index.js generate-fixtures --verbose
```

#### ContractTester
- Validates protocol manifests against their specifications
- Tests OpenAPI, AsyncAPI, manifest, workflow, agent, data, event, and semantic schemas
- Provides detailed validation errors and success reporting

```bash
# Run contract tests
node test-infrastructure/index.js run-contracts --verbose
```

#### PerformanceBenchmarks
- Validates performance targets for protocol operations
- Tests prompt latency, generation write, validation time, and CLI render performance
- Generates performance reports with statistical analysis

```bash
# Run performance benchmarks
node test-infrastructure/index.js run-performance --verbose
```

#### PropertyTester
- Generates property-based tests for protocol validation
- Creates tests that validate properties hold across many random inputs
- Generates test data generators for each protocol type

```bash
# Generate property-based tests
node scripts/generate-property-tests.js
```

#### CoverageReporter
- Manages test coverage reporting and quality gates
- Configures Jest coverage thresholds
- Generates coverage reports with recommendations

### 2. CI/CD Pipeline (`.github/workflows/ci.yml`)

The GitHub Actions pipeline includes:

#### Test Job
- Runs on Node.js 18.x and 20.x
- Generates test fixtures
- Runs contract tests
- Executes performance benchmarks
- Runs Jest test suite with coverage
- Validates coverage thresholds

#### Quality Gates Job
- Runs complete test suite
- Generates quality reports
- Validates coverage thresholds
- Fails build if quality gates not met

#### Security Job
- Runs security audit
- Checks for secrets in code
- Validates security best practices

#### Build Job
- Builds project artifacts
- Archives build outputs
- Prepares for deployment

#### Deploy Job
- Deploys to staging environment
- Runs smoke tests
- Validates deployment success

## Usage

### Running Tests Locally

```bash
# Run complete test suite
node test-infrastructure/index.js run-all --verbose

# Run specific test components
node test-infrastructure/index.js generate-fixtures
node test-infrastructure/index.js run-contracts
node test-infrastructure/index.js run-performance
node test-infrastructure/index.js validate-targets

# Run Jest tests with coverage
npm test -- --coverage --watchAll=false

# Run property-based tests
npm test -- --testPathPattern="property" --watchAll=false
```

### Performance Targets

The infrastructure validates these performance targets:

```yaml
prompt_latency: <100ms typical
generation_write: <50ms per file
validation_time: <50ms per manifest
cli_render: <20ms per 50 events
```

### Coverage Thresholds

Quality gates enforce these coverage thresholds:

```yaml
global:
  branches: 80%
  functions: 80%
  lines: 80%
  statements: 80%

critical:
  branches: 90%
  functions: 90%
  lines: 90%
  statements: 90%
```

Critical modules requiring higher coverage:
- `core/graph`
- `core/governance`
- `validation`
- `feedback`
- `generators/scaffold`

## Test Structure

### Fixtures (`tests/fixtures/`)
- `generated/` - Auto-generated test fixtures
- `manifests/` - Protocol manifest examples
- `openapi/` - OpenAPI specification examples
- `asyncapi/` - AsyncAPI specification examples

### Property Tests (`tests/property/`)
- `openapi/` - OpenAPI property-based tests
- `asyncapi/` - AsyncAPI property-based tests
- `manifest/` - Manifest property-based tests
- `workflow/` - Workflow property-based tests
- `agent/` - Agent property-based tests

### Test Infrastructure Tests (`tests/test-infrastructure/`)
- `contract-tester.test.js` - Contract testing validation
- `performance-benchmarks.test.js` - Performance benchmark tests
- `test-fixtures.test.js` - Fixture generation tests

## Configuration

### Jest Configuration (`jest.config.js`)
- ES modules support
- Coverage reporting
- Test environment configuration
- Module name mapping for mocks

### GitHub Actions Configuration (`.github/workflows/ci.yml`)
- Multi-node version testing
- Parallel job execution
- Artifact management
- Security scanning

## Monitoring and Reporting

### Performance Reports
- Generated in `tests/performance/`
- Includes statistical analysis (mean, median, p95, p99)
- Validates against performance targets
- Provides recommendations for optimization

### Coverage Reports
- Generated in `coverage/`
- HTML and JSON formats
- Threshold validation
- Critical module analysis

### Quality Reports
- Overall test suite health
- Coverage threshold compliance
- Performance target validation
- Security audit results

## Troubleshooting

### Common Issues

1. **Module Resolution Errors**
   - Ensure proper ES module imports
   - Check Jest configuration for module mapping
   - Verify file paths are correct

2. **Performance Test Failures**
   - Check system resources
   - Verify performance targets are realistic
   - Review benchmark implementation

3. **Coverage Threshold Failures**
   - Add tests for uncovered code
   - Review critical module coverage
   - Adjust thresholds if appropriate

4. **Property Test Failures**
   - Check property generator output
   - Verify test data validity
   - Review property assertions

### Debug Commands

```bash
# Verbose test output
node test-infrastructure/index.js run-all --verbose

# Specific test debugging
npm test -- --testPathPattern="specific-test" --verbose

# Performance debugging
node test-infrastructure/index.js run-performance --verbose

# Coverage debugging
npm test -- --coverage --watchAll=false --verbose
```

## Integration

The test infrastructure integrates with:

- **Protocol Discovery**: Validates protocol specifications
- **Scaffolding Tools**: Tests generated artifacts
- **Feedback System**: Validates error handling and progress tracking
- **Governance**: Tests protocol compliance
- **Graph Operations**: Validates protocol relationships

## Future Enhancements

- Remote telemetry and analytics dashboards
- Advanced template marketplace testing
- Integration with external CI/CD systems
- Performance regression detection
- Automated test generation from protocol specifications
