import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

import { searchCommand } from '../../cli/commands/search.js';

function createTestConsole() {
  const warnings: Array<{ message: string; lines?: string[] }> = [];
  const errors: Array<{ message: string; lines?: string[] }> = [];
  const successes: Array<{ message: string; lines?: string[] }> = [];

  return {
    interactive: false,
    warnings,
    errors,
    successes,
    spinner: () => ({
      start() {},
      stop() {},
      succeed() {},
      fail() {},
      update() {}
    }),
    warn(message: string, lines?: string[]) {
      warnings.push({ message, lines });
    },
    error(message: string, lines?: string[]) {
      errors.push({ message, lines });
    },
    success(message: string, lines?: string[]) {
      successes.push({ message, lines });
    },
    info() {}
  };
}

describe('searchCommand', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = undefined;
  });

  it('outputs JSON payload and activation summary when requested', async () => {
    const searchService = {
      search: jest.fn().mockResolvedValue({
        ok: true,
        query: 'workflow automation',
        limit: 5,
        returned: 1,
        totalCandidates: 1,
        results: [
          {
            rank: 1,
            tool_id: 'urn:alpha',
            urn: 'urn:alpha',
            name: 'Alpha Tool',
            summary: 'Executes alpha workflows',
            capabilities: ['tool.execute'],
            schema_uri: 'schema://alpha',
            score: 0.91
          }
        ],
        timings: {
          embeddingMs: 5.25,
          vectorSearchMs: 2.1,
          totalMs: 9.7
        }
      }),
      shutdown: jest.fn()
    };

    const activationService = {
      activate: jest.fn().mockResolvedValue({
        urn: 'urn:alpha',
        tool_id: 'urn:alpha',
        capabilities: ['tool.execute'],
        metadata: {
          name: 'Alpha Tool',
          entrypoint: 'alpha.run'
        }
      }),
      shutdown: jest.fn()
    };

    const result = await searchCommand('workflow automation', {
      json: true,
      activate: true,
      workspace: '/tmp/workspace',
      searchServiceFactory: async () => searchService,
      activationServiceFactory: async () => activationService
    });

    expect(searchService.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'workflow automation' })
    );
    expect(activationService.activate).toHaveBeenCalledWith(
      expect.objectContaining({ tool_id: 'urn:alpha' })
    );
    expect(searchService.shutdown).toHaveBeenCalled();
    expect(activationService.shutdown).toHaveBeenCalled();

    expect(logSpy).toHaveBeenCalled();
    const payload = JSON.parse(logSpy.mock.calls[0][0]);
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0].tool_id).toBe('urn:alpha');
    expect(payload.activation.urn).toBe('urn:alpha');
    expect(result?.activation?.tool_id).toBe('urn:alpha');
    expect(process.exitCode).toBeUndefined();
  });

  it('warns when no results are returned', async () => {
    const consoleStub = createTestConsole();
    const searchService = {
      search: jest.fn().mockResolvedValue({
        ok: true,
        query: 'no matches',
        results: []
      }),
      shutdown: jest.fn()
    };

    const result = await searchCommand('no matches', {
      console: consoleStub,
      searchServiceFactory: async () => searchService
    });

    expect(searchService.search).toHaveBeenCalled();
    expect(searchService.shutdown).toHaveBeenCalled();
    expect(consoleStub.warnings.length).toBeGreaterThan(0);
    expect(consoleStub.warnings[0].message).toContain('No matching tools found.');
    expect(result?.results).toHaveLength(0);
    expect(process.exitCode).toBeUndefined();
  });

  it('handles search failures gracefully', async () => {
    const consoleStub = createTestConsole();
    const searchService = {
      search: jest.fn().mockRejectedValue(new Error('Vector index unavailable')),
      shutdown: jest.fn()
    };

    const result = await searchCommand('broken', {
      console: consoleStub,
      searchServiceFactory: async () => searchService
    });

    expect(result).toBeNull();
    expect(searchService.search).toHaveBeenCalled();
    expect(searchService.shutdown).toHaveBeenCalled();
    expect(consoleStub.errors.length).toBeGreaterThan(0);
    expect(consoleStub.errors[0].lines?.[0]).toContain('Vector index unavailable');
    expect(process.exitCode).toBe(1);
  });
});
