/**
 * Tests for AsyncAPI version normalizer
 * Focus on branch coverage for conditional logic and error handling
 */

import {
  normalizeServers,
  normalizeChannel,
  normalizeOperations,
  normalizeMessage,
  extractServerVariables,
  extractChannelParameters,
  detectVersion
} from '../../../packages/runtime/importers/asyncapi/version-normalizer.js';

describe('AsyncAPI Version Normalizer', () => {
  describe('normalizeServers', () => {
    it('should normalize servers with all properties', () => {
      const mockDocument = {
        servers: () => ({
          all: () => [
            {
              id: () => 'test-server',
              protocol: () => 'kafka',
              protocolVersion: () => '2.0',
              url: () => 'localhost:9092',
              description: () => 'Test server',
              variables: () => ({
                all: () => [
                  {
                    id: () => 'host',
                    defaultValue: () => 'localhost',
                    description: () => 'Host name',
                    enum: () => ['localhost', 'prod.example.com']
                  }
                ]
              }),
              bindings: () => ({ kafka: { clientId: 'test' } })
            }
          ]
        })
      };

      const result = normalizeServers(mockDocument);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'test-server',
        protocol: 'kafka',
        protocolVersion: '2.0',
        url: 'localhost:9092',
        description: 'Test server',
        variables: {
          host: {
            default: 'localhost',
            description: 'Host name',
            enum: ['localhost', 'prod.example.com']
          }
        },
        bindings: { kafka: { clientId: 'test' } }
      });
    });

    it('should handle empty servers list', () => {
      const mockDocument = {
        servers: () => ({
          all: () => []
        })
      };

      const result = normalizeServers(mockDocument);
      expect(result).toEqual([]);
    });
  });

  describe('extractServerVariables', () => {
    it('should extract server variables successfully', () => {
      const mockServer = {
        variables: () => ({
          all: () => [
            {
              id: () => 'port',
              defaultValue: () => '9092',
              description: () => 'Port number',
              enum: () => ['9092', '9093']
            }
          ]
        })
      };

      const result = extractServerVariables(mockServer);
      
      expect(result).toEqual({
        port: {
          default: '9092',
          description: 'Port number',
          enum: ['9092', '9093']
        }
      });
    });

    it('should handle error in variable extraction and return empty object', () => {
      const mockServer = {
        variables: () => {
          throw new Error('Variable extraction failed');
        }
      };

      const result = extractServerVariables(mockServer);
      expect(result).toEqual({});
    });

    it('should handle server without variables method', () => {
      const mockServer = {};

      const result = extractServerVariables(mockServer);
      expect(result).toEqual({});
    });
  });

  describe('normalizeChannel', () => {
    it('should normalize channel with address property (3.x)', () => {
      const mockChannel = {
        id: () => 'user-events',
        address: () => 'user.events',
        description: () => 'User events channel',
        servers: () => ({
          all: () => [{ id: () => 'kafka-server' }]
        }),
        bindings: () => ({ kafka: { topic: 'user-events' } }),
        parameters: () => ({
          all: () => [
            {
              id: () => 'userId',
              description: () => 'User ID parameter',
              schema: () => ({ type: 'string' })
            }
          ]
        })
      };

      const result = normalizeChannel(mockChannel);
      
      expect(result).toEqual({
        id: 'user-events',
        address: 'user.events',
        description: 'User events channel',
        servers: ['kafka-server'],
        bindings: { kafka: { topic: 'user-events' } },
        parameters: {
          userId: {
            description: 'User ID parameter',
            schema: { type: 'string' }
          }
        }
      });
    });

    it('should normalize channel without address property (2.x fallback)', () => {
      const mockChannel = {
        id: () => 'user-events',
        address: () => null, // 2.x doesn't have address
        description: () => 'User events channel',
        servers: () => ({
          all: () => []
        }),
        bindings: () => ({ kafka: { topic: 'user-events' } }),
        parameters: () => ({
          all: () => []
        })
      };

      const result = normalizeChannel(mockChannel);
      
      expect(result.address).toBe('user-events'); // Should fallback to id
    });
  });

  // Note: extractChannelServers is not exported, testing through normalizeChannel

  describe('extractChannelParameters', () => {
    it('should extract channel parameters successfully', () => {
      const mockChannel = {
        parameters: () => ({
          all: () => [
            {
              id: () => 'version',
              description: () => 'API version',
              schema: () => ({ type: 'string', enum: ['v1', 'v2'] })
            }
          ]
        })
      };

      const result = extractChannelParameters(mockChannel);
      
      expect(result).toEqual({
        version: {
          description: 'API version',
          schema: { type: 'string', enum: ['v1', 'v2'] }
        }
      });
    });

    it('should handle error in parameter extraction and return empty object', () => {
      const mockChannel = {
        parameters: () => {
          throw new Error('Parameter extraction failed');
        }
      };

      const result = extractChannelParameters(mockChannel);
      expect(result).toEqual({});
    });

    it('should handle channel without parameters method', () => {
      const mockChannel = {};

      const result = extractChannelParameters(mockChannel);
      expect(result).toEqual({});
    });
  });

  describe('normalizeOperations', () => {
    it('should normalize operations successfully', () => {
      const mockChannel = {
        operations: () => ({
          all: () => [
            {
              id: () => 'sendMessage',
              action: () => 'send',
              description: () => 'Send a message',
              messages: () => ({
                all: () => [
                  { id: 'message1', name: 'UserMessage' }
                ]
              }),
              bindings: () => ({ kafka: { groupId: 'test-group' } })
            }
          ]
        })
      };

      const result = normalizeOperations(mockChannel);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'sendMessage',
        action: 'send',
        description: 'Send a message',
        messages: [{ id: 'message1', name: 'UserMessage' }],
        bindings: { kafka: { groupId: 'test-group' } }
      });
    });

    it('should handle error in operations extraction and return empty array', () => {
      const mockChannel = {
        operations: () => {
          throw new Error('Operations extraction failed');
        }
      };

      const result = normalizeOperations(mockChannel);
      expect(result).toEqual([]);
    });

    it('should handle channel without operations method', () => {
      const mockChannel = {};

      const result = normalizeOperations(mockChannel);
      expect(result).toEqual([]);
    });
  });

  // Note: extractOperationMessages is not exported, testing through normalizeOperations

  describe('normalizeMessage', () => {
    it('should normalize message with all properties', () => {
      const mockMessage = {
        id: () => 'user-created',
        name: () => 'UserCreated',
        title: () => 'User Created Event',
        description: () => 'Event when user is created',
        contentType: () => 'application/json',
        payload: () => ({ type: 'object' }),
        headers: () => ({ correlationId: { type: 'string' } }),
        bindings: () => ({ kafka: { key: 'userId' } }),
        examples: () => ({
          all: () => [
            {
              name: () => 'example1',
              summary: () => 'Basic user creation',
              payload: () => ({ userId: '123', name: 'John' }),
              headers: () => ({ correlationId: 'abc-123' })
            }
          ]
        })
      };

      const result = normalizeMessage(mockMessage);
      
      expect(result).toEqual({
        id: 'user-created',
        name: 'UserCreated',
        title: 'User Created Event',
        description: 'Event when user is created',
        contentType: 'application/json',
        payload: { type: 'object' },
        headers: { correlationId: { type: 'string' } },
        bindings: { kafka: { key: 'userId' } },
        examples: [
          {
            name: 'example1',
            summary: 'Basic user creation',
            payload: { userId: '123', name: 'John' },
            headers: { correlationId: 'abc-123' }
          }
        ]
      });
    });
  });

  // Note: extractMessageExamples is not exported, testing through normalizeMessage

  describe('detectVersion', () => {
    it('should detect AsyncAPI 2.x version', () => {
      const mockDocument = {
        version: () => '2.6.0'
      };

      const result = detectVersion(mockDocument);
      
      expect(result).toEqual({
        full: '2.6.0',
        major: 2,
        is2x: true,
        is3x: false
      });
    });

    it('should detect AsyncAPI 3.x version', () => {
      const mockDocument = {
        version: () => '3.0.0'
      };

      const result = detectVersion(mockDocument);
      
      expect(result).toEqual({
        full: '3.0.0',
        major: 3,
        is2x: false,
        is3x: true
      });
    });

    it('should handle version with multiple dots', () => {
      const mockDocument = {
        version: () => '2.5.12'
      };

      const result = detectVersion(mockDocument);
      
      expect(result).toEqual({
        full: '2.5.12',
        major: 2,
        is2x: true,
        is3x: false
      });
    });

    it('should handle single digit version', () => {
      const mockDocument = {
        version: () => '3'
      };

      const result = detectVersion(mockDocument);
      
      expect(result).toEqual({
        full: '3',
        major: 3,
        is2x: false,
        is3x: true
      });
    });
  });
});
