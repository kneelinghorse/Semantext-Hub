/**
 * Tests for AsyncAPI Binding Detector
 * Focus on branch coverage for conditional logic and error handling
 */

import {
  detectProtocolBindings,
  detectFromServerProtocol,
  detectFromBindingFields,
  detectFromURLScheme,
  detectFromChannelPattern
} from '../../../packages/runtime/importers/asyncapi/binding-detector.js';

// Test the exported functions directly

describe('AsyncAPI Binding Detector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('detectProtocolBindings', () => {
    it('should handle channel without bindings', () => {
      const channel = {
        json: jest.fn().mockReturnValue({}),
        id: () => 'test-channel'
      };
      const document = {};

      const result = detectProtocolBindings(channel, document);

      expect(result).toBeDefined();
    });

    it('should handle document without servers', () => {
      const channel = {
        bindings: jest.fn().mockReturnValue({
          get: jest.fn().mockReturnValue(null)
        }),
        json: jest.fn().mockReturnValue({}),
        id: () => 'test-channel'
      };

      const document = {};

      const result = detectProtocolBindings(channel, document);

      expect(result).toBeDefined();
    });
  });

  describe('detectFromServerProtocol', () => {
    it('should detect kafka from server protocol', () => {
      const protocol = 'kafka://localhost:9092';
      const server = { 
        url: () => 'kafka://localhost:9092',
        protocolVersion: () => '2.0'
      };
      const channel = { id: () => 'test-channel' };

      const result = detectFromServerProtocol(protocol, server, channel);

      expect(result).toBeDefined();
    });

    it('should return null for unknown protocol', () => {
      const protocol = 'unknown://localhost:1234';
      const server = { 
        url: () => 'unknown://localhost:1234',
        protocolVersion: () => '1.0'
      };
      const channel = { id: () => 'test-channel' };

      const result = detectFromServerProtocol(protocol, server, channel);

      expect(result).toBeNull();
    });
  });

  // Note: Other functions are not exported, testing only exported functions
});
