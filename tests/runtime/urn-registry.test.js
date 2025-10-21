/**
 * URN Registry Tests
 * 
 * Comprehensive test suite for the URN registry with:
 * - Unit tests for all registry operations
 * - Integration tests for persistence
 * - Error handling tests
 * - Performance tests
 * - Mock file system operations
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const mkdirMock = jest.fn();
const readFileMock = jest.fn();
const writeFileMock = jest.fn();
const unlinkMock = jest.fn();
const rmMock = jest.fn();

jest.unstable_mockModule('node:fs/promises', () => ({
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
  unlink: unlinkMock,
  rm: rmMock
}));

const fs = await import('node:fs/promises');

const {
  URNRegistry,
  createURNRegistry,
  registerAgent,
  getAgent,
  __resetRegistryCache
} = await import('../../packages/runtime/runtime/urn-registry.js');

import { 
  URNError, 
  URNFormatError, 
  URNResolutionError 
} from '../../packages/runtime/runtime/urn-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('URN Registry', () => {
  let registry;
  let testDataDir;
  let mockAgentData;

  beforeEach(() => {
    testDataDir = join(__dirname, '../../data/test-registry');
    
    mockAgentData = {
      urn: 'urn:agent:ai:ml-agent@1.0.0',
      name: 'ml-agent',
      version: '1.0.0',
      description: 'Machine learning inference agent',
      capabilities: {
        'ml-inference': {
          type: 'service',
          description: 'Machine learning model inference',
          version: '1.0.0'
        },
        'data-processing': {
          type: 'service',
          description: 'Data processing capabilities',
          version: '1.0.0'
        }
      },
      endpoints: {
        api: '/api/v1',
        health: '/health',
        metrics: '/metrics'
      }
    };

    // Reset mocks
    jest.clearAllMocks();
    
    // Mock successful file operations
    fs.mkdir.mockResolvedValue();
    fs.readFile.mockRejectedValue({ code: 'ENOENT' }); // File doesn't exist
    fs.writeFile.mockResolvedValue();
    fs.unlink.mockResolvedValue();
    fs.rm.mockResolvedValue();
  });

  afterEach(async () => {
    if (registry) {
      try {
        await registry.shutdown();
      } catch {
        // Ignore shutdown errors in cleanup
      }
      registry = null;
    }
    await __resetRegistryCache();
  });

  describe('Registry Initialization', () => {
    test('should initialize with default configuration', async () => {
      registry = createURNRegistry();
      await registry.initialize();
      
      expect(registry.isInitialized).toBe(true);
      expect(registry.stats.totalAgents).toBe(0);
    });

    test('should initialize with custom configuration', async () => {
      registry = createURNRegistry({
        dataDir: testDataDir,
        enableLogging: false,
        maxAgents: 500
      });
      
      await registry.initialize();
      
      expect(registry.isInitialized).toBe(true);
      expect(registry.config.dataDir).toBe(testDataDir);
      expect(registry.config.maxAgents).toBe(500);
    });

    test('should create data directory if it does not exist', async () => {
      registry = createURNRegistry({ dataDir: testDataDir });
      await registry.initialize();
      
      expect(fs.mkdir).toHaveBeenCalledWith(testDataDir, { recursive: true });
      expect(fs.mkdir).toHaveBeenCalledWith(
        join(testDataDir, 'agents'), 
        { recursive: true }
      );
    });

    test('should load existing index if available', async () => {
      const existingIndex = {
        index: [['urn:agent:test:agent@1.0.0', { name: 'test-agent' }]],
        domainIndex: [['test', [{ name: 'test-agent' }]]],
        capabilityIndex: [['test-capability', [{ name: 'test-agent' }]]],
        stats: { totalAgents: 1, domains: 1, capabilities: 1 }
      };

      fs.readFile.mockResolvedValue(JSON.stringify(existingIndex));

      registry = createURNRegistry({ dataDir: testDataDir });
      await registry.initialize();
      
      expect(registry.stats.totalAgents).toBe(1);
      expect(registry.index.size).toBe(1);
    });

    test('should handle initialization errors gracefully', async () => {
      fs.mkdir.mockRejectedValue(new Error('Permission denied'));
      
      registry = createURNRegistry({ dataDir: testDataDir });
      
      await expect(registry.initialize()).rejects.toThrow(URNError);
    });
  });

  describe('Agent Registration', () => {
    beforeEach(async () => {
      registry = createURNRegistry({ dataDir: testDataDir });
      await registry.initialize();
    });

    test('should register agent successfully', async () => {
      const result = await registry.registerAgent(mockAgentData);
      
      expect(result.success).toBe(true);
      expect(result.urn).toBe(mockAgentData.urn);
      expect(result.registeredAt).toBeDefined();
      expect(registry.stats.totalAgents).toBe(1);
    });

    test('should store agent data to file', async () => {
      await registry.registerAgent(mockAgentData);
      
      const expectedFilename = 'urn_agent_ai_ml-agent_1_0_0.json';
      const expectedPath = join(testDataDir, 'agents', expectedFilename);
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        expectedPath,
        expect.stringContaining('"urn":"urn:agent:ai:ml-agent@1.0.0"')
      );
    });

    test('should update indexes after registration', async () => {
      await registry.registerAgent(mockAgentData);
      
      expect(registry.index.has(mockAgentData.urn)).toBe(true);
      expect(registry.domainIndex.has('ai')).toBe(true);
      expect(registry.capabilityIndex.has('ml-inference')).toBe(true);
      expect(registry.capabilityIndex.has('data-processing')).toBe(true);
    });

    test('should update statistics after registration', async () => {
      await registry.registerAgent(mockAgentData);
      
      expect(registry.stats.totalAgents).toBe(1);
      expect(registry.stats.domains).toBe(1);
      expect(registry.stats.capabilities).toBe(2);
      expect(registry.stats.domainStats.ai).toBe(1);
      expect(registry.stats.capabilityStats['ml-inference']).toBe(1);
    });

    test('should emit agentRegistered event', async () => {
      const eventSpy = jest.fn();
      registry.on('agentRegistered', eventSpy);
      
      await registry.registerAgent(mockAgentData);
      
      expect(eventSpy).toHaveBeenCalledWith({
        urn: mockAgentData.urn,
        name: mockAgentData.name,
        registeredAt: expect.any(String)
      });
    });

    test('should reject duplicate agent registration', async () => {
      await registry.registerAgent(mockAgentData);
      
      await expect(registry.registerAgent(mockAgentData))
        .rejects.toThrow(URNResolutionError);
    });

    test('should reject registration when capacity exceeded', async () => {
      registry = createURNRegistry({ 
        dataDir: testDataDir, 
        maxAgents: 1 
      });
      await registry.initialize();
      
      await registry.registerAgent(mockAgentData);
      
      const anotherAgent = { ...mockAgentData, urn: 'urn:agent:ai:another-agent@1.0.0' };
      
      await expect(registry.registerAgent(anotherAgent))
        .rejects.toThrow(URNError);
    });

    test('should validate agent data', async () => {
      const invalidAgent = { name: 'test' }; // Missing required fields
      
      await expect(registry.registerAgent(invalidAgent))
        .rejects.toThrow(URNError);
    });

    test('should validate URN format', async () => {
      const invalidAgent = { 
        ...mockAgentData, 
        urn: 'invalid-urn-format' 
      };
      
      await expect(registry.registerAgent(invalidAgent))
        .rejects.toThrow(URNFormatError);
    });
  });

  describe('Agent Retrieval', () => {
    beforeEach(async () => {
      registry = createURNRegistry({ dataDir: testDataDir });
      await registry.initialize();
      await registry.registerAgent(mockAgentData);
    });

    test('should get agent by URN', async () => {
      const agent = await registry.getAgent(mockAgentData.urn);
      
      expect(agent).toBeDefined();
      expect(agent.urn).toBe(mockAgentData.urn);
      expect(agent.name).toBe(mockAgentData.name);
      expect(agent.registeredAt).toBeDefined();
    });

    test('should return null for non-existent agent', async () => {
      const agent = await registry.getAgent('urn:agent:ai:non-existent@1.0.0');
      
      expect(agent).toBeNull();
    });

    test('should validate URN format when getting agent', async () => {
      await expect(registry.getAgent('invalid-urn'))
        .rejects.toThrow(URNFormatError);
    });
  });

  describe('Domain Operations', () => {
    beforeEach(async () => {
      registry = createURNRegistry({ dataDir: testDataDir });
      await registry.initialize();
      
      // Register multiple agents in different domains
      await registry.registerAgent(mockAgentData);
      
      const dataAgent = {
        ...mockAgentData,
        urn: 'urn:agent:data:etl-agent@1.0.0',
        name: 'etl-agent',
        description: 'ETL processing agent'
      };
      await registry.registerAgent(dataAgent);
    });

    test('should list agents by domain', async () => {
      const aiAgents = await registry.listAgentsByDomain('ai');
      const dataAgents = await registry.listAgentsByDomain('data');
      
      expect(aiAgents).toHaveLength(1);
      expect(aiAgents[0].urn).toBe(mockAgentData.urn);
      
      expect(dataAgents).toHaveLength(1);
      expect(dataAgents[0].urn).toBe('urn:agent:data:etl-agent@1.0.0');
    });

    test('should return empty array for non-existent domain', async () => {
      const agents = await registry.listAgentsByDomain('non-existent');
      
      expect(agents).toHaveLength(0);
    });
  });

  describe('Capability Operations', () => {
    beforeEach(async () => {
      registry = createURNRegistry({ dataDir: testDataDir });
      await registry.initialize();
      await registry.registerAgent(mockAgentData);
    });

    test('should search agents by capability', async () => {
      const agents = await registry.searchAgentsByCapability('ml-inference');
      
      expect(agents).toHaveLength(1);
      expect(agents[0].urn).toBe(mockAgentData.urn);
    });

    test('should return empty array for non-existent capability', async () => {
      const agents = await registry.searchAgentsByCapability('non-existent');
      
      expect(agents).toHaveLength(0);
    });
  });

  describe('Statistics and Health', () => {
    beforeEach(async () => {
      registry = createURNRegistry({ dataDir: testDataDir });
      await registry.initialize();
      await registry.registerAgent(mockAgentData);
    });

    test('should provide registry statistics', () => {
      const stats = registry.getStats();
      
      expect(stats.totalAgents).toBe(1);
      expect(stats.domains).toBe(1);
      expect(stats.capabilities).toBe(2);
      expect(stats.domainStats.ai).toBe(1);
      expect(stats.capabilityStats['ml-inference']).toBe(1);
    });

    test('should provide health status', () => {
      const health = registry.getHealth();
      
      expect(health.status).toBe('healthy');
      expect(health.isInitialized).toBe(true);
      expect(health.totalAgents).toBe(1);
    });
  });

  describe('Registry Management', () => {
    beforeEach(async () => {
      registry = createURNRegistry({ dataDir: testDataDir });
      await registry.initialize();
      await registry.registerAgent(mockAgentData);
    });

    test('should clear registry', async () => {
      await registry.clear();
      
      expect(registry.stats.totalAgents).toBe(0);
      expect(registry.index.size).toBe(0);
      expect(registry.domainIndex.size).toBe(0);
      expect(registry.capabilityIndex.size).toBe(0);
    });

    test('should shutdown gracefully', async () => {
      await registry.shutdown();
      
      expect(registry.isInitialized).toBe(false);
      expect(fs.writeFile).toHaveBeenCalled(); // Should save index
    });
  });

  describe('Convenience Functions', () => {
    test('should register agent using convenience function', async () => {
      const result = await registerAgent(mockAgentData, { dataDir: testDataDir });
      
      expect(result.success).toBe(true);
      expect(result.urn).toBe(mockAgentData.urn);
    });

    test('should get agent using convenience function', async () => {
      // First register an agent
      await registerAgent(mockAgentData, { dataDir: testDataDir });
      
      // Then get it
      const agent = await getAgent(mockAgentData.urn, { dataDir: testDataDir });
      
      expect(agent).toBeDefined();
      expect(agent.urn).toBe(mockAgentData.urn);
    });
  });

  describe('Error Handling', () => {
    test('should handle file system errors during registration', async () => {
      fs.writeFile.mockRejectedValue(new Error('Disk full'));
      
      registry = createURNRegistry({ dataDir: testDataDir });
      await registry.initialize();
      
      await expect(registry.registerAgent(mockAgentData))
        .rejects.toThrow(URNError);
    });

    test('should handle corrupted index file', async () => {
      fs.readFile.mockResolvedValue('invalid json');
      
      registry = createURNRegistry({ dataDir: testDataDir });
      
      await expect(registry.initialize())
        .rejects.toThrow(URNError);
    });

    test('should handle index save errors', async () => {
      registry = createURNRegistry({ dataDir: testDataDir });
      await registry.initialize();
      
      fs.writeFile.mockRejectedValue(new Error('Permission denied'));
      
      await expect(registry.shutdown())
        .rejects.toThrow(URNError);
    });
  });

  describe('Performance', () => {
    test('should handle large number of agents efficiently', async () => {
      registry = createURNRegistry({ dataDir: testDataDir });
      await registry.initialize();
      
      const startTime = Date.now();
      
      // Register 100 agents
      for (let i = 0; i < 100; i++) {
        const agent = {
          ...mockAgentData,
          urn: `urn:agent:ai:agent-${i}@1.0.0`,
          name: `agent-${i}`
        };
        await registry.registerAgent(agent);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
      expect(registry.stats.totalAgents).toBe(100);
    });

    test('should perform fast lookups', async () => {
      registry = createURNRegistry({ dataDir: testDataDir });
      await registry.initialize();
      
      // Register agents
      for (let i = 0; i < 50; i++) {
        const agent = {
          ...mockAgentData,
          urn: `urn:agent:ai:agent-${i}@1.0.0`,
          name: `agent-${i}`
        };
        await registry.registerAgent(agent);
      }
      
      const startTime = Date.now();
      
      // Perform 100 lookups
      for (let i = 0; i < 100; i++) {
        const urn = `urn:agent:ai:agent-${i % 50}@1.0.0`;
        await registry.getAgent(urn);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    });
  });
});
