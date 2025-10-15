import { describe, it, expect } from '@jest/globals';
import { generateRandomAgent } from '../../fixtures/generated/agent/property-generator.js';

describe('Agent Property Tests', () => {
  it('should always have required agent fields', async () => {
    for (let i = 0; i < 100; i++) {
      const agent = generateRandomAgent();
      expect(agent.agent).toBeDefined();
      expect(agent.agent.id).toBeDefined();
      expect(agent.agent.name).toBeDefined();
      expect(agent.agent.version).toBeDefined();
      expect(typeof agent.agent.id).toBe('string');
      expect(typeof agent.agent.name).toBe('string');
      expect(typeof agent.agent.version).toBe('string');
    }
  });

  it('should always have valid capabilities structure', async () => {
    for (let i = 0; i < 100; i++) {
      const agent = generateRandomAgent();
      
      if (agent.capabilities) {
        expect(typeof agent.capabilities).toBe('object');
        
        if (agent.capabilities.tools) {
          expect(Array.isArray(agent.capabilities.tools)).toBe(true);
          for (const tool of agent.capabilities.tools) {
            expect(tool.name).toBeDefined();
            expect(tool.description).toBeDefined();
            expect(typeof tool.name).toBe('string');
            expect(typeof tool.description).toBe('string');
          }
        }
      }
    }
  });

  it('should always have valid version format', async () => {
    for (let i = 0; i < 100; i++) {
      const agent = generateRandomAgent();
      expect(agent.agent.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('should always have valid URN references', async () => {
    for (let i = 0; i < 100; i++) {
      const agent = generateRandomAgent();
      
      if (agent.relationships) {
        for (const [type, urns] of Object.entries(agent.relationships)) {
          expect(Array.isArray(urns)).toBe(true);
          for (const urn of urns) {
            expect(urn).toMatch(/^urn:proto:[a-z]+:[^@]+@\d+\.\d+\.\d+$/);
          }
        }
      }
    }
  });
});