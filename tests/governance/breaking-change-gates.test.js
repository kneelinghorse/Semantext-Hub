/**
 * Negative Tests for Breaking Change Gates in Governance
 * 
 * Tests that breaking changes are properly detected and rejected
 * without migrations, ensuring protocol stability.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import graphCore from '../../packages/protocols/core/graph/index.mjs';
import overrides from '../../packages/protocols/core/overrides/index.js';
import governance from '../../packages/protocols/core/governance/index.mjs';
import { deflake } from '../util/deflake.js';

const { ProtocolGraph, NodeKind, EdgeKind } = graphCore;
const { OverrideEngine } = overrides;
const { GovernanceGenerator } = governance;

describe('Breaking Change Gates - Negative Tests', () => {
  let graph;
  let overrideEngine;
  let generator;
  let isolationContext;

  beforeEach(() => {
    graph = new ProtocolGraph();
    overrideEngine = new OverrideEngine();
    generator = new GovernanceGenerator({
      graph,
      overrideEngine,
      manifests: []
    });
    isolationContext = deflake.createIsolationContext();
  });

  describe('API Breaking Changes', () => {
    it('should always reject removal of required fields', async () => {
      // Setup initial API
      const originalApi = {
        urn: 'urn:proto:api:test.com/users@1.0.0',
        type: 'api',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['api', 'users']
        },
        spec: {
          openapi: '3.0.0',
          paths: {
            '/users': {
              get: {
                responses: {
                  '200': {
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          required: ['id', 'name', 'email'],
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            email: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      // Breaking change: remove required field
      const breakingApi = {
        ...originalApi,
        urn: 'urn:proto:api:test.com/users@2.0.0',
        spec: {
          ...originalApi.spec,
          paths: {
            '/users': {
              get: {
                responses: {
                  '200': {
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          required: ['id', 'name'], // Removed 'email' - BREAKING
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' }
                            // email removed
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      graph.addNode(originalApi.urn, NodeKind.API, originalApi);

      // Test that breaking change is detected
      const breakingChangeResult = graph.assessRisk(originalApi.urn, breakingApi);
      expect(breakingChangeResult.hasBreakingChanges).toBe(true);
      expect(breakingChangeResult.breakingChanges).toContain('removed_required_field');
      expect(breakingChangeResult.riskLevel).toBe('high');
    });

    it('should always reject type changes in existing fields', async () => {
      const originalApi = {
        urn: 'urn:proto:api:test.com/products@1.0.0',
        type: 'api',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['api', 'products']
        },
        spec: {
          openapi: '3.0.0',
          paths: {
            '/products': {
              get: {
                responses: {
                  '200': {
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            price: { type: 'number' },
                            available: { type: 'boolean' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      // Breaking change: change field type
      const breakingApi = {
        ...originalApi,
        urn: 'urn:proto:api:test.com/products@2.0.0',
        spec: {
          ...originalApi.spec,
          paths: {
            '/products': {
              get: {
                responses: {
                  '200': {
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            price: { type: 'string' }, // Changed from number to string - BREAKING
                            available: { type: 'boolean' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      graph.addNode(originalApi.urn, NodeKind.API, originalApi);

      const breakingChangeResult = graph.assessRisk(originalApi.urn, breakingApi);
      expect(breakingChangeResult.hasBreakingChanges).toBe(true);
      expect(breakingChangeResult.breakingChanges).toContain('field_type_changed');
      expect(breakingChangeResult.riskLevel).toBe('high');
    });

    it('should always reject removal of API endpoints', async () => {
      const originalApi = {
        urn: 'urn:proto:api:test.com/orders@1.0.0',
        type: 'api',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['api', 'orders']
        },
        spec: {
          openapi: '3.0.0',
          paths: {
            '/orders': {
              get: {
                responses: {
                  '200': {
                    content: {
                      'application/json': {
                        schema: { type: 'object' }
                      }
                    }
                  }
                }
              },
              post: {
                responses: {
                  '201': {
                    content: {
                      'application/json': {
                        schema: { type: 'object' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      // Breaking change: remove endpoint
      const breakingApi = {
        ...originalApi,
        urn: 'urn:proto:api:test.com/orders@2.0.0',
        spec: {
          ...originalApi.spec,
          paths: {
            '/orders': {
              get: {
                responses: {
                  '200': {
                    content: {
                      'application/json': {
                        schema: { type: 'object' }
                      }
                    }
                  }
                }
              }
              // post endpoint removed - BREAKING
            }
          }
        }
      };

      graph.addNode(originalApi.urn, NodeKind.API, originalApi);

      const breakingChangeResult = graph.assessRisk(originalApi.urn, breakingApi);
      expect(breakingChangeResult.hasBreakingChanges).toBe(true);
      expect(breakingChangeResult.breakingChanges).toContain('endpoint_removed');
      expect(breakingChangeResult.riskLevel).toBe('high');
    });

    it('should always reject changes to response status codes', async () => {
      const originalApi = {
        urn: 'urn:proto:api:test.com/payments@1.0.0',
        type: 'api',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['api', 'payments']
        },
        spec: {
          openapi: '3.0.0',
          paths: {
            '/payments': {
              post: {
                responses: {
                  '201': {
                    content: {
                      'application/json': {
                        schema: { type: 'object' }
                      }
                    }
                  },
                  '400': {
                    content: {
                      'application/json': {
                        schema: { type: 'object' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      // Breaking change: change status code
      const breakingApi = {
        ...originalApi,
        urn: 'urn:proto:api:test.com/payments@2.0.0',
        spec: {
          ...originalApi.spec,
          paths: {
            '/payments': {
              post: {
                responses: {
                  '200': { // Changed from 201 to 200 - BREAKING
                    content: {
                      'application/json': {
                        schema: { type: 'object' }
                      }
                    }
                  },
                  '400': {
                    content: {
                      'application/json': {
                        schema: { type: 'object' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      graph.addNode(originalApi.urn, NodeKind.API, originalApi);

      const breakingChangeResult = graph.assessRisk(originalApi.urn, breakingApi);
      expect(breakingChangeResult.hasBreakingChanges).toBe(true);
      expect(breakingChangeResult.breakingChanges).toContain('response_code_changed');
      expect(breakingChangeResult.riskLevel).toBe('high');
    });
  });

  describe('Data Schema Breaking Changes', () => {
    it('should always reject removal of data fields', async () => {
      const originalData = {
        urn: 'urn:proto:data:test.com/user@1.0.0',
        type: 'data',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['data', 'user']
        },
        spec: {
          schema: {
            type: 'object',
            required: ['id', 'name', 'email', 'createdAt'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      };

      // Breaking change: remove field
      const breakingData = {
        ...originalData,
        urn: 'urn:proto:data:test.com/user@2.0.0',
        spec: {
          schema: {
            type: 'object',
            required: ['id', 'name'], // Removed 'email' and 'createdAt' - BREAKING
            properties: {
              id: { type: 'string' },
              name: { type: 'string' }
              // email and createdAt removed
            }
          }
        }
      };

      graph.addNode(originalData.urn, NodeKind.DATA, originalData);

      const breakingChangeResult = graph.assessRisk(originalData.urn, breakingData);
      expect(breakingChangeResult.hasBreakingChanges).toBe(true);
      expect(breakingChangeResult.breakingChanges).toContain('field_removed');
      expect(breakingChangeResult.riskLevel).toBe('high');
    });

    it('should always reject changes to data field constraints', async () => {
      const originalData = {
        urn: 'urn:proto:data:test.com/product@1.0.0',
        type: 'data',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['data', 'product']
        },
        spec: {
          schema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string', maxLength: 100 },
              price: { type: 'number', minimum: 0 },
              category: { type: 'string', enum: ['electronics', 'clothing', 'books'] }
            }
          }
        }
      };

      // Breaking change: tighten constraints
      const breakingData = {
        ...originalData,
        urn: 'urn:proto:data:test.com/product@2.0.0',
        spec: {
          schema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string', maxLength: 50 }, // Reduced from 100 - BREAKING
              price: { type: 'number', minimum: 10 }, // Increased from 0 - BREAKING
              category: { type: 'string', enum: ['electronics', 'clothing'] } // Removed 'books' - BREAKING
            }
          }
        }
      };

      graph.addNode(originalData.urn, NodeKind.DATA, originalData);

      const breakingChangeResult = graph.assessRisk(originalData.urn, breakingData);
      expect(breakingChangeResult.hasBreakingChanges).toBe(true);
      expect(breakingChangeResult.breakingChanges).toContain('constraint_tightened');
      expect(breakingChangeResult.riskLevel).toBe('high');
    });
  });

  describe('Event Schema Breaking Changes', () => {
    it('should always reject removal of event fields', async () => {
      const originalEvent = {
        urn: 'urn:proto:event:test.com/order-created@1.0.0',
        type: 'event',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['event', 'order']
        },
        spec: {
          schema: {
            type: 'object',
            required: ['orderId', 'customerId', 'timestamp', 'items'],
            properties: {
              orderId: { type: 'string' },
              customerId: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    productId: { type: 'string' },
                    quantity: { type: 'number' }
                  }
                }
              }
            }
          }
        }
      };

      // Breaking change: remove field
      const breakingEvent = {
        ...originalEvent,
        urn: 'urn:proto:event:test.com/order-created@2.0.0',
        spec: {
          schema: {
            type: 'object',
            required: ['orderId', 'customerId'], // Removed 'timestamp' and 'items' - BREAKING
            properties: {
              orderId: { type: 'string' },
              customerId: { type: 'string' }
              // timestamp and items removed
            }
          }
        }
      };

      graph.addNode(originalEvent.urn, NodeKind.EVENT, originalEvent);

      const breakingChangeResult = graph.assessRisk(originalEvent.urn, breakingEvent);
      expect(breakingChangeResult.hasBreakingChanges).toBe(true);
      expect(breakingChangeResult.breakingChanges).toContain('field_removed');
      expect(breakingChangeResult.riskLevel).toBe('high');
    });

    it('should always reject changes to event payload structure', async () => {
      const originalEvent = {
        urn: 'urn:proto:event:test.com/payment-processed@1.0.0',
        type: 'event',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['event', 'payment']
        },
        spec: {
          schema: {
            type: 'object',
            properties: {
              paymentId: { type: 'string' },
              amount: { type: 'number' },
              currency: { type: 'string' },
              status: { type: 'string', enum: ['success', 'failed', 'pending'] }
            }
          }
        }
      };

      // Breaking change: change payload structure
      const breakingEvent = {
        ...originalEvent,
        urn: 'urn:proto:event:test.com/payment-processed@2.0.0',
        spec: {
          schema: {
            type: 'object',
            properties: {
              paymentId: { type: 'string' },
              amount: { type: 'string' }, // Changed from number to string - BREAKING
              currency: { type: 'string' },
              status: { type: 'number' } // Changed from string to number - BREAKING
            }
          }
        }
      };

      graph.addNode(originalEvent.urn, NodeKind.EVENT, originalEvent);

      const breakingChangeResult = graph.assessRisk(originalEvent.urn, breakingEvent);
      expect(breakingChangeResult.hasBreakingChanges).toBe(true);
      expect(breakingChangeResult.breakingChanges).toContain('payload_structure_changed');
      expect(breakingChangeResult.riskLevel).toBe('high');
    });
  });

  describe('Dependency Breaking Changes', () => {
    it('should always reject removal of required dependencies', async () => {
      // Setup dependent protocol
      const baseApi = {
        urn: 'urn:proto:api:test.com/base@1.0.0',
        type: 'api',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['api', 'base']
        }
      };

      const dependentApi = {
        urn: 'urn:proto:api:test.com/dependent@1.0.0',
        type: 'api',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['api', 'dependent']
        },
        dependencies: [baseApi.urn]
      };

      graph.addNode(baseApi.urn, NodeKind.API, baseApi);
      graph.addNode(dependentApi.urn, NodeKind.API, dependentApi);
      graph.addEdge(dependentApi.urn, EdgeKind.DEPENDS_ON, baseApi.urn);

      // Breaking change: remove dependency
      const breakingDependentApi = {
        ...dependentApi,
        urn: 'urn:proto:api:test.com/dependent@2.0.0',
        dependencies: [] // Removed dependency - BREAKING
      };

      const breakingChangeResult = graph.assessRisk(dependentApi.urn, breakingDependentApi);
      expect(breakingChangeResult.hasBreakingChanges).toBe(true);
      expect(breakingChangeResult.breakingChanges).toContain('dependency_removed');
      expect(breakingChangeResult.riskLevel).toBe('high');
    });

    it('should always reject changes to dependency versions', async () => {
      const baseApiV1 = {
        urn: 'urn:proto:api:test.com/base@1.0.0',
        type: 'api',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['api', 'base']
        }
      };

      const baseApiV2 = {
        urn: 'urn:proto:api:test.com/base@2.0.0',
        type: 'api',
        namespace: 'test.com',
        metadata: {
          governance: { version: '2.0.0' },
          tags: ['api', 'base']
        }
      };

      const dependentApi = {
        urn: 'urn:proto:api:test.com/dependent@1.0.0',
        type: 'api',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['api', 'dependent']
        },
        dependencies: [baseApiV1.urn]
      };

      graph.addNode(baseApiV1.urn, NodeKind.API, baseApiV1);
      graph.addNode(baseApiV2.urn, NodeKind.API, baseApiV2);
      graph.addNode(dependentApi.urn, NodeKind.API, dependentApi);
      graph.addEdge(dependentApi.urn, EdgeKind.DEPENDS_ON, baseApiV1.urn);

      // Breaking change: change dependency version
      const breakingDependentApi = {
        ...dependentApi,
        urn: 'urn:proto:api:test.com/dependent@2.0.0',
        dependencies: [baseApiV2.urn] // Changed from v1 to v2 - BREAKING
      };

      const breakingChangeResult = graph.assessRisk(dependentApi.urn, breakingDependentApi);
      expect(breakingChangeResult.hasBreakingChanges).toBe(true);
      expect(breakingChangeResult.breakingChanges).toContain('dependency_version_changed');
      expect(breakingChangeResult.riskLevel).toBe('high');
    });
  });

  describe('Migration Requirements', () => {
    it('should always require migration for breaking changes', async () => {
      const originalApi = {
        urn: 'urn:proto:api:test.com/migration-test@1.0.0',
        type: 'api',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['api']
        },
        spec: {
          openapi: '3.0.0',
          paths: {
            '/test': {
              get: {
                responses: {
                  '200': {
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          required: ['field1'],
                          properties: {
                            field1: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      // Breaking change without migration
      const breakingApi = {
        ...originalApi,
        urn: 'urn:proto:api:test.com/migration-test@2.0.0',
        spec: {
          ...originalApi.spec,
          paths: {
            '/test': {
              get: {
                responses: {
                  '200': {
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          required: ['field2'], // Changed required field - BREAKING
                          properties: {
                            field2: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      graph.addNode(originalApi.urn, NodeKind.API, originalApi);

      const breakingChangeResult = graph.assessRisk(originalApi.urn, breakingApi);
      expect(breakingChangeResult.hasBreakingChanges).toBe(true);
      expect(breakingChangeResult.requiresMigration).toBe(true);
      expect(breakingChangeResult.migrationRequired).toBe(true);
      expect(breakingChangeResult.riskLevel).toBe('high');
    });

    it('should always reject breaking changes without proper migration plan', async () => {
      const originalApi = {
        urn: 'urn:proto:api:test.com/no-migration@1.0.0',
        type: 'api',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['api']
        }
      };

      // Breaking change without migration
      const breakingApi = {
        ...originalApi,
        urn: 'urn:proto:api:test.com/no-migration@2.0.0',
        // No migration field - should be rejected
      };

      graph.addNode(originalApi.urn, NodeKind.API, originalApi);

      const breakingChangeResult = graph.assessRisk(originalApi.urn, breakingApi);
      expect(breakingChangeResult.hasBreakingChanges).toBe(true);
      expect(breakingChangeResult.requiresMigration).toBe(true);
      expect(breakingChangeResult.migrationRequired).toBe(true);
      expect(breakingChangeResult.approved).toBe(false);
      expect(breakingChangeResult.rejectionReason).toContain('migration required');
    });
  });

  describe('Governance Policy Enforcement', () => {
    it('should always enforce breaking change policies', async () => {
      for (let i = 0; i < 50; i++) {
        const testData = deflake.generateDeterministicData(`policy_test_${i}`, {
          changeType: 'string',
          severity: 'string'
        });

        const breakingChange = {
          type: testData.changeType || 'field_removal',
          severity: testData.severity || 'high',
          description: `Breaking change ${i}`,
          impact: 'high',
          migrationRequired: true
        };

        const policyResult = generator.enforceBreakingChangePolicy(breakingChange);
        
        expect(policyResult.approved).toBe(false);
        expect(policyResult.reason).toContain('breaking change');
        expect(policyResult.requiresApproval).toBe(true);
        expect(policyResult.riskLevel).toBe('high');
      }
    });

    it('should always require approval for high-risk changes', async () => {
      for (let i = 0; i < 30; i++) {
        const highRiskChange = {
          type: 'api_breaking',
          severity: 'high',
          description: `High risk change ${i}`,
          impact: 'high',
          affectedConsumers: Math.floor(Math.random() * 100) + 1
        };

        const approvalResult = generator.requireApproval(highRiskChange);
        
        expect(approvalResult.required).toBe(true);
        expect(approvalResult.approvers).toBeDefined();
        expect(approvalResult.approvers.length).toBeGreaterThan(0);
        expect(approvalResult.deadline).toBeDefined();
      }
    });

    it('should always track breaking change violations', async () => {
      for (let i = 0; i < 20; i++) {
        const violation = {
          protocolUrn: `urn:proto:api:test.com/violation${i}@1.0.0`,
          changeType: 'breaking',
          severity: 'high',
          timestamp: new Date().toISOString(),
          description: `Violation ${i}`
        };

        const trackingResult = generator.trackViolation(violation);
        
        expect(trackingResult.tracked).toBe(true);
        expect(trackingResult.violationId).toBeDefined();
        expect(trackingResult.escalationRequired).toBe(true);
        expect(trackingResult.notificationSent).toBe(true);
      }
    });
  });

  describe('Edge Case Breaking Changes', () => {
    it('should always detect subtle breaking changes', async () => {
      for (let i = 0; i < 30; i++) {
        const originalApi = {
          urn: `urn:proto:api:test.com/subtle${i}@1.0.0`,
          type: 'api',
          namespace: 'test.com',
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['api']
          },
          spec: {
            openapi: '3.0.0',
            paths: {
              '/test': {
                get: {
                  responses: {
                    '200': {
                      content: {
                        'application/json': {
                          schema: {
                            type: 'object',
                            properties: {
                              field: { type: 'string', format: 'email' }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        };

        // Subtle breaking change: change format
        const breakingApi = {
          ...originalApi,
          urn: `urn:proto:api:test.com/subtle${i}@2.0.0`,
          spec: {
            ...originalApi.spec,
            paths: {
              '/test': {
                get: {
                  responses: {
                    '200': {
                      content: {
                        'application/json': {
                          schema: {
                            type: 'object',
                            properties: {
                              field: { type: 'string', format: 'uri' } // Changed format - BREAKING
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        };

        graph.addNode(originalApi.urn, NodeKind.API, originalApi);

        const breakingChangeResult = graph.assessRisk(originalApi.urn, breakingApi);
        expect(breakingChangeResult.hasBreakingChanges).toBe(true);
        expect(breakingChangeResult.breakingChanges).toContain('format_changed');
        expect(breakingChangeResult.riskLevel).toBe('medium');
      }
    });

    it('should always handle complex nested breaking changes', async () => {
      for (let i = 0; i < 20; i++) {
        const originalApi = {
          urn: `urn:proto:api:test.com/complex${i}@1.0.0`,
          type: 'api',
          namespace: 'test.com',
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['api']
          },
          spec: {
            openapi: '3.0.0',
            paths: {
              '/complex': {
                post: {
                  requestBody: {
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          required: ['data'],
                          properties: {
                            data: {
                              type: 'object',
                              required: ['items'],
                              properties: {
                                items: {
                                  type: 'array',
                                  items: {
                                    type: 'object',
                                    required: ['id', 'value'],
                                    properties: {
                                      id: { type: 'string' },
                                      value: { type: 'number' }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        };

        // Complex breaking change: remove nested required field
        const breakingApi = {
          ...originalApi,
          urn: `urn:proto:api:test.com/complex${i}@2.0.0`,
          spec: {
            ...originalApi.spec,
            paths: {
              '/complex': {
                post: {
                  requestBody: {
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          required: ['data'],
                          properties: {
                            data: {
                              type: 'object',
                              required: ['items'],
                              properties: {
                                items: {
                                  type: 'array',
                                  items: {
                                    type: 'object',
                                    required: ['id'], // Removed 'value' - BREAKING
                                    properties: {
                                      id: { type: 'string' }
                                      // value removed
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        };

        graph.addNode(originalApi.urn, NodeKind.API, originalApi);

        const breakingChangeResult = graph.assessRisk(originalApi.urn, breakingApi);
        expect(breakingChangeResult.hasBreakingChanges).toBe(true);
        expect(breakingChangeResult.breakingChanges).toContain('nested_field_removed');
        expect(breakingChangeResult.riskLevel).toBe('high');
      }
    });
  });
});
