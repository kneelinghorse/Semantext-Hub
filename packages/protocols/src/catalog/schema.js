/**
 * Type definitions and JSON schema for URN Catalog Index
 * @module catalog/schema
 */

/**
 * Protocol type enumeration
 * @typedef {'event-protocol'|'data-protocol'|'api-protocol'|'ui-protocol'} ProtocolType
 */

/**
 * Classification levels for governance
 * @typedef {'public'|'internal'|'confidential'|'restricted'} ClassificationLevel
 */

/**
 * Checksum information for artifact integrity
 * @typedef {Object} Checksum
 * @property {string} sha256
 * @property {string} [sha512]
 */

/**
 * Governance metadata for compliance and ownership
 * @typedef {Object} GovernanceMetadata
 * @property {ClassificationLevel} classification
 * @property {string} owner
 * @property {boolean} pii
 * @property {string[]} [compliance]
 * @property {string} [retention]
 */

/**
 * Artifact metadata
 * @typedef {Object} ArtifactMetadata
 * @property {string[]} tags
 * @property {GovernanceMetadata} governance
 * @property {string} [description]
 * @property {string} [license]
 * @property {boolean} [deprecated]
 * @property {string} [deprecationMessage]
 */

/**
 * Complete artifact manifest entry
 * @typedef {Object} ArtifactManifest
 * @property {string} urn
 * @property {string} name
 * @property {string} version
 * @property {string} namespace
 * @property {ProtocolType} type
 * @property {string} manifest
 * @property {Checksum} [checksum]
 * @property {number} [size]
 * @property {string} [published]
 * @property {string[]} dependencies
 * @property {ArtifactMetadata} metadata
 */

/**
 * Secondary indexes for efficient queries
 * @typedef {Object} CatalogIndexes
 * @property {Object<string,string[]>} byNamespace
 * @property {Object<string,string[]>} byTag
 * @property {Object<string,string[]>} byOwner
 * @property {string[]} byPII
 */

/**
 * Dependency graph structure
 * @typedef {Object} DependencyGraphNode
 * @property {string[]} dependencies
 * @property {string[]} dependents
 */

/**
 * Complete catalog index structure
 * @typedef {Object} CatalogIndex
 * @property {string} [\$schema]
 * @property {string} version
 * @property {'urn-catalog-v1'} format
 * @property {string} lastModified
 * @property {Object<string,ArtifactManifest>} artifacts
 * @property {CatalogIndexes} indexes
 * @property {Object<string,DependencyGraphNode>} dependencyGraph
 */

/**
 * Sparse index structure for scaled catalogs
 * @typedef {Object} SparseCatalogIndex
 * @property {string} version
 * @property {'urn-catalog-sparse-v1'} format
 * @property {Object<string,string>} chunks
 * @property {{ totalArtifacts:number, lastModified:string, compression?:string }} metadata
 */

/**
 * Chunk file structure for sparse indexes
 * @typedef {Object} CatalogChunk
 * @property {string} namespace
 * @property {Object<string,ArtifactManifest>} artifacts
 */

/**
 * Criteria for governance-based queries
 * @typedef {Object} GovernanceCriteria
 * @property {string} [namespace]
 * @property {string} [owner]
 * @property {boolean} [pii]
 * @property {string[]} [tags]
 * @property {ClassificationLevel} [classification]
 * @property {string[]} [compliance]
 */

/**
 * Query result with metadata
 * @template T
 * @typedef {Object} QueryResult
 * @property {Array<T>} results
 * @property {number} count
 * @property {number} took
 */

/**
 * JSON Schema for catalog index validation
 */
export const catalogIndexSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'urn:manifest:catalog:index:v1',
  type: 'object',
  required: ['version', 'format', 'lastModified', 'artifacts', 'indexes', 'dependencyGraph'],
  properties: {
    $schema: {
      type: 'string',
      format: 'uri'
    },
    version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+\\.\\d+$'
    },
    format: {
      type: 'string',
      enum: ['urn-catalog-v1']
    },
    lastModified: {
      type: 'string',
      format: 'date-time'
    },
    artifacts: {
      type: 'object',
      patternProperties: {
        '^urn:protocol:(event|data|api|ui):[a-z][a-z0-9]*\\.[a-z][a-z0-9]*:\\d+\\.\\d+\\.\\d+$': {
          type: 'object',
          required: ['urn', 'name', 'version', 'namespace', 'type', 'manifest', 'dependencies', 'metadata'],
          properties: {
            urn: {
              type: 'string',
              pattern: '^urn:protocol:(event|data|api|ui):[a-z][a-z0-9]*\\.[a-z][a-z0-9]*:\\d+\\.\\d+\\.\\d+$'
            },
            name: {
              type: 'string',
              minLength: 1
            },
            version: {
              type: 'string',
              pattern: '^\\d+\\.\\d+\\.\\d+$'
            },
            namespace: {
              type: 'string',
              pattern: '^urn:protocol:(event|data|api|ui)$'
            },
            type: {
              type: 'string',
              enum: ['event-protocol', 'data-protocol', 'api-protocol', 'ui-protocol']
            },
            manifest: {
              type: 'string',
              format: 'uri'
            },
            checksum: {
              type: 'object',
              required: ['sha256'],
              properties: {
                sha256: {
                  type: 'string',
                  pattern: '^[a-f0-9]{64}$'
                },
                sha512: {
                  type: 'string',
                  pattern: '^[a-f0-9]{128}$'
                }
              }
            },
            size: {
              type: 'number',
              minimum: 0
            },
            published: {
              type: 'string',
              format: 'date-time'
            },
            dependencies: {
              type: 'array',
              items: {
                type: 'string',
                pattern: '^urn:protocol:(event|data|api|ui):[a-z][a-z0-9]*\\.[a-z][a-z0-9]*:\\d+\\.\\d+\\.\\d+$'
              }
            },
            metadata: {
              type: 'object',
              required: ['tags', 'governance'],
              properties: {
                tags: {
                  type: 'array',
                  items: {
                    type: 'string',
                    minLength: 1
                  }
                },
                governance: {
                  type: 'object',
                  required: ['classification', 'owner', 'pii'],
                  properties: {
                    classification: {
                      type: 'string',
                      enum: ['public', 'internal', 'confidential', 'restricted']
                    },
                    owner: {
                      type: 'string',
                      minLength: 1
                    },
                    pii: {
                      type: 'boolean'
                    },
                    compliance: {
                      type: 'array',
                      items: {
                        type: 'string'
                      }
                    },
                    retention: {
                      type: 'string'
                    }
                  }
                },
                description: {
                  type: 'string'
                },
                license: {
                  type: 'string'
                },
                deprecated: {
                  type: 'boolean'
                },
                deprecationMessage: {
                  type: 'string'
                }
              }
            }
          }
        }
      }
    },
    indexes: {
      type: 'object',
      required: ['byNamespace', 'byTag', 'byOwner', 'byPII'],
      properties: {
        byNamespace: {
          type: 'object',
          patternProperties: {
            '.*': {
              type: 'array',
              items: {
                type: 'string'
              }
            }
          }
        },
        byTag: {
          type: 'object',
          patternProperties: {
            '.*': {
              type: 'array',
              items: {
                type: 'string'
              }
            }
          }
        },
        byOwner: {
          type: 'object',
          patternProperties: {
            '.*': {
              type: 'array',
              items: {
                type: 'string'
              }
            }
          }
        },
        byPII: {
          type: 'array',
          items: {
            type: 'string'
          }
        }
      }
    },
    dependencyGraph: {
      type: 'object',
      patternProperties: {
        '.*': {
          type: 'object',
          required: ['dependencies', 'dependents'],
          properties: {
            dependencies: {
              type: 'array',
              items: {
                type: 'string'
              }
            },
            dependents: {
              type: 'array',
              items: {
                type: 'string'
              }
            }
          }
        }
      }
    }
  }
};
