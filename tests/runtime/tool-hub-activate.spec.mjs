import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { ToolHubActivationService } from '../../packages/runtime/services/tool-hub/activation-service.js';

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child() {
    return this;
  }
};

describe('ToolHubActivationService', () => {
  let baseLoader;
  let baseManifest;

  beforeEach(() => {
    baseManifest = {
      name: 'Alpha Tool',
      summary: 'Executes alpha workflows',
      version: '1.2.3',
      tags: ['alpha', 'workflow'],
      activation: {
        entrypoint: 'npm run alpha',
        instructions: 'Install deps then run npm run alpha'
      },
      metadata: {
        schema: 'schema://alpha',
        owner: 'alpha-team@example.com',
        tags: ['automation'],
        activation: {
          entrypoint: 'npm run alpha',
          instructions: 'Install deps then run npm run alpha'
        }
      }
    };

    baseLoader = jest.fn(async (urn) => ({
      urn,
      tool_id: urn,
      manifest: baseManifest,
      capabilities: ['tool.execute', 'tool.observe'],
      digest: 'sha256-alpha',
      issuer: 'builder://alpha',
      signature: 'signed',
      updated_at: '2025-10-01T12:00:00Z',
      provenance: { builder: 'builder://alpha' }
    }));
  });

  test('returns manifest, metadata, and IAM context when activation succeeds', async () => {
    const iamFilter = {
      filter: jest.fn(async (results) =>
        results.map((result) => ({
          ...result,
          iam: { allowed: true, reason: 'policy_allow' }
        }))
      )
    };

    const service = new ToolHubActivationService({
      toolLoader: baseLoader,
      iamFilter,
      logger: noopLogger
    });

    const result = await service.activate({
      tool_id: 'urn:alpha',
      actor: { id: 'agent://operator', capabilities: ['tool.execute'] }
    });

    expect(result.ok).toBe(true);
    expect(result.urn).toBe('urn:alpha');
    expect(result.tool_id).toBe('urn:alpha');
    expect(result.digest).toBe('sha256-alpha');
    expect(result.metadata.name).toBe('Alpha Tool');
    expect(result.metadata.schema).toBe('schema://alpha');
    expect(result.metadata.entrypoint).toBe('npm run alpha');
    expect(result.capabilities).toEqual(['tool.execute', 'tool.observe']);
    expect(result.manifest).toBe(baseManifest);
    expect(result.iam).toEqual({ allowed: true, reason: 'policy_allow' });
    expect(typeof result.resolved_at).toBe('string');
    expect(baseLoader).toHaveBeenCalledWith('urn:alpha');
    expect(iamFilter.filter).toHaveBeenCalledTimes(1);
  });

  test('omits manifest and provenance when disabled via flags', async () => {
    const iamFilter = {
      filter: jest.fn(async (results) =>
        results.map((result) => ({
          ...result,
          iam: { allowed: true, reason: 'policy_allow' }
        }))
      )
    };

    const service = new ToolHubActivationService({
      toolLoader: baseLoader,
      iamFilter,
      logger: noopLogger
    });

    const result = await service.activate({
      tool_id: 'urn:alpha',
      includeManifest: false,
      includeProvenance: false,
      actor: { id: 'agent://viewer', capabilities: ['tool.observe'] }
    });

    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty('manifest');
    expect(result).not.toHaveProperty('provenance');
    expect(result.capabilities).toEqual(['tool.execute', 'tool.observe']);
  });

  test('throws when IAM denies activation', async () => {
    const iamFilter = {
      filter: jest.fn(async () => [])
    };

    const service = new ToolHubActivationService({
      toolLoader: baseLoader,
      iamFilter,
      logger: noopLogger
    });

    await expect(
      service.activate({
        tool_id: 'urn:alpha',
        actor: { id: 'agent://restricted', capabilities: [] }
      })
    ).rejects.toMatchObject({
      code: 'IAM_DENIED'
    });

    expect(iamFilter.filter).toHaveBeenCalledTimes(1);
  });

  test('throws when tool is not found', async () => {
    const iamFilter = {
      filter: jest.fn(async () => [])
    };
    const missingLoader = jest.fn(async () => null);

    const service = new ToolHubActivationService({
      toolLoader: missingLoader,
      iamFilter,
      logger: noopLogger
    });

    await expect(
      service.activate({
        tool_id: 'urn:missing',
        actor: { id: 'agent://operator' }
      })
    ).rejects.toMatchObject({
      code: 'NOT_FOUND'
    });

    expect(missingLoader).toHaveBeenCalledWith('urn:missing');
    expect(iamFilter.filter).not.toHaveBeenCalled();
  });
});
