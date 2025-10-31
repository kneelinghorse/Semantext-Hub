# Observability Integration Example

This example demonstrates a production-depth observability integration using Semantext Hub's multi-protocol capabilities across Logs, Metrics, and Event protocols.

## Overview

This pattern shows how to:
- Integrate log collection with metrics aggregation
- Coordinate event-driven observability workflows
- Implement comprehensive monitoring and alerting
- Execute observability pipelines with real-time processing

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Log Collector │    │   Metrics Hub   │    │   Event Bus     │
│   (Structured   │◄──►│   (Time Series)  │◄──►│   (Kafka)       │
│    Logs)        │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Observability │
                    │   Orchestrator  │
                    └─────────────────┘
```

## Quick Start

```bash
# 1. Discover log protocols
ossp discover event ./fixtures/log-collector-asyncapi.json --output ./artifacts/log-collector

# 2. Discover metrics protocols
ossp discover api ./fixtures/metrics-hub-openapi.json --output ./artifacts/metrics-hub

# 3. Discover event protocols
ossp discover event ./fixtures/event-bus-asyncapi.json --output ./artifacts/event-bus

# 4. Validate the ecosystem
ossp validate --ecosystem --manifests ./artifacts

# 5. Generate governance documentation
ossp governance --manifests ./artifacts --output ./GOVERNANCE.md

# 6. Run the observability workflow
ossp workflow simulate ./workflows/observability-pipeline.yaml
```

## Files

- `log-collector-protocol.json` - Log collection service protocol
- `metrics-hub-protocol.json` - Metrics aggregation service protocol
- `event-bus-protocol.json` - Event bus service protocol
- `observability-pipeline.yaml` - End-to-end observability workflow
- `GOVERNANCE.md` - Generated governance documentation

## Validation

The pattern includes comprehensive validation:
- Cross-protocol dependency checking
- Log format compatibility validation
- Metrics schema validation
- Event flow validation
- Performance requirement validation

## Data Flow

1. **Log Collector** receives structured logs from applications
2. **Metrics Hub** aggregates time-series metrics
3. **Event Bus** publishes observability events
4. **Orchestrator** coordinates the entire observability pipeline

## Monitoring Capabilities

- Real-time log processing and analysis
- Metrics aggregation and alerting
- Event-driven observability workflows
- Performance monitoring and optimization
- Error tracking and resolution

## Next Steps

1. Customize the protocols for your observability stack
2. Add additional log sources and metrics collectors
3. Implement the orchestrator workflow
4. Deploy and monitor the integration
5. Scale the observability pipeline for production workloads
