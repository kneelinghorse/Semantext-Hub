import { describe, it, expect } from '@jest/globals';
import { generateRandomManifest } from '../../fixtures/generated/manifest/property-generator.js';

describe('Manifest Property Tests', () => {
  it('should always have valid apiVersion', async () => {
    for (let i = 0; i < 100; i++) {
      const manifest = generateRandomManifest();
      expect(manifest.apiVersion).toMatch(/^protocol\.ossp-agi\.dev\/v\d+$/);
    }
  });

  it('should always have valid kind', async () => {
    const validKinds = ['APIProtocol', 'DataProtocol', 'EventProtocol', 'SemanticProtocol'];
    
    for (let i = 0; i < 100; i++) {
      const manifest = generateRandomManifest();
      expect(validKinds).toContain(manifest.kind);
    }
  });

  it('should always have required metadata', async () => {
    for (let i = 0; i < 100; i++) {
      const manifest = generateRandomManifest();
      expect(manifest.metadata).toBeDefined();
      expect(manifest.metadata.name).toBeDefined();
      expect(manifest.metadata.version).toBeDefined();
      expect(typeof manifest.metadata.name).toBe('string');
      expect(typeof manifest.metadata.version).toBe('string');
    }
  });

  it('should always have valid spec structure', async () => {
    for (let i = 0; i < 100; i++) {
      const manifest = generateRandomManifest();
      expect(manifest.spec).toBeDefined();
      expect(typeof manifest.spec).toBe('object');
    }
  });

  it('should always have valid version format', async () => {
    for (let i = 0; i < 100; i++) {
      const manifest = generateRandomManifest();
      expect(manifest.metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});