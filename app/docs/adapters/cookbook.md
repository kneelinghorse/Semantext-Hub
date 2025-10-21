# Adapter Cookbook

Practical mappings and tips for common sources (OpenAPI, AsyncAPI, Postgres).

## Adapter Versions

| Adapter | Version |
|---|---|
| @ossp/asyncapi-adapter | 0.1.0 |
| @ossp/openapi-adapter | 0.1.0 |
| @ossp/postgres-adapter | 0.1.0 |

## Generated Mapping Tables

### asyncapi

| From JSONPath | To JSONPath | Description |
|---|---|---|
| $.channels[*] | $.catalog.events.channels[] | Map AsyncAPI channels to catalog event channels. |

### openapi

| From JSONPath | To JSONPath | Description |
|---|---|---|
| $.paths[*] | $.catalog.http.endpoints[] | Map OpenAPI path+method pairs to catalog HTTP endpoints. |

### postgres

| From JSONPath | To JSONPath | Description |
|---|---|---|
| $.tables[*] | $.catalog.data.entities[] | Map table definitions to catalog data entities. |

## Troubleshooting

- Ensure your `schema.map.json` aligns with catalog primitives.
- Validate manifests with the Authoring UI before committing.
- Keep adapter versions in sync with this cookbook.
