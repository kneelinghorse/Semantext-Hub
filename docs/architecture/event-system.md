# Semantext Hub Event System

This document describes the Redis Streams event infrastructure introduced for Sprint 02 (mission B2.4). The design implements the recommendations from R2.2 *Implementation Guide to Redis-Based Eventing* and provides a durable way to observe tool activation and context updates without blocking primary workflows.

## Architecture Overview

- **Redis Streams** provide at-least-once delivery and durable retention. Stream names follow `{env}:{domain}:{object}:{event}:{objectId}` (e.g. `dev:semantext:tool:activated:search-service`).
- **RedisEventPublisher** (`packages/runtime/events/event-publisher.js`) handles event emission with XADD. It automatically builds event envelopes, trims streams when configured, and degrades gracefully if Redis is unavailable.
- **RedisEventConsumer** (`packages/runtime/events/event-consumer.js`) wraps XREADGROUP/XACK to support consumer groups. It exposes helpers for group creation, message parsing, and acknowledgements.
- **ContextStore** (`packages/runtime/services/context/context-store.js`) is the persistence boundary for context writes. Entries are appended to `var/context/events.jsonl` and mirrored to Redis Streams when available.
- **CLI Listener** (`sch events listen`) uses `RedisEventConsumer` to watch streams from the terminal and prints formatted events (or JSON) for debugging.

## Event Envelope

Every message uses the schema defined in `packages/runtime/events/schemas.js`:

```jsonc
{
  "metadata": {
    "eventId": "uuid",
    "eventType": "ToolActivated",
    "source": "tool_hub.activate",
    "timestamp": "ISO-8601",
    "version": "1.0.0",
    "correlationId": "optional",
    "context": { "urn": "...", "actorId": "..." },
    "tags": ["tool", "activation"]
  },
  "payload": {
    "urn": "urn:...",
    "toolId": "...",
    "actor": { "id": "..." },
    "capabilities": ["tool.execute"],
    "metadata": { "name": "..." },
    "resolvedAt": "ISO-8601"
  }
}
```

The publisher enforces this structure, ensuring downstream consumers can rely on consistent metadata regardless of the event source.

## Key Integrations

- **ToolHub activation** now publishes a `ToolActivated` event and records a context entry whenever `tool_hub.activate` succeeds (`packages/runtime/services/tool-hub/activation-service.js`).
- **Protocol MCP server** creates a shared `RedisEventPublisher`/`ContextStore` when it boots so that both the runtime and CLI leverage the same naming and connection conventions (`packages/runtime/bin/protocol-mcp-server.js`).
- **Tests** cover publisher behaviour, consumer group processing, and context persistence under `tests/runtime/events/` using a deterministic in-memory Redis mock.

## Operational Notes

- Configure Redis via `SEMANTEXT_REDIS_URL` or `REDIS_URL`. The CLI and runtime fall back to `redis://127.0.0.1:6379/0` for local development (Docker Compose already exposes this endpoint from Sprint 01).
- If Redis is offline, publishers log a warning and continue without throwing—primary workflows (search/activate) are unaffected.
- Use `sch events listen --object tool --event activated --object-id <tool>` to tail activation events. Pass `--json` for machine-readable output or `--no-ack` while debugging replay scenarios.

This foundation unlocks downstream missions (B2.5/B2.6) that need reliable out-of-band signalling, retrieval evaluation hooks, or future webhook integrations.
