import { describe, beforeEach, afterEach, test, expect, jest } from '@jest/globals';

const SERVER_MODULE_PATH = '../../app/services/registry/server.mjs';
const RUNTIME_SERVER_PATH = '../../packages/runtime/registry/server.mjs';
const RUNTIME_DB_PATH = '../../packages/runtime/registry/db.mjs';

describe('app/services/registry/server.mjs', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.OSSP_AGI_SILENCE_REGISTRY_DEPRECATION;
    jest.resetModules();
  });

  afterEach(() => {
    warnSpy.mockRestore();
    delete process.env.OSSP_AGI_SILENCE_REGISTRY_DEPRECATION;
  });

  test('emits a deprecation warning exactly once when loaded', async () => {
    const module = await import(SERVER_MODULE_PATH);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('app/services/registry/server.mjs is now a thin proxy'),
    );

    const runtimeModule = await import(RUNTIME_SERVER_PATH);
    expect(module.createServer).toBe(runtimeModule.createServer);
    expect(module.startServer).toBe(runtimeModule.startServer);
    expect(module.loadOpenApiSpec).toBe(runtimeModule.loadOpenApiSpec);
  });

  test('suppresses the warning when OSSP_AGI_SILENCE_REGISTRY_DEPRECATION is set', async () => {
    process.env.OSSP_AGI_SILENCE_REGISTRY_DEPRECATION = '1';
    const module = await import(SERVER_MODULE_PATH);
    expect(warnSpy).not.toHaveBeenCalled();

    const runtimeDb = await import(RUNTIME_DB_PATH);
    expect(module.openDb).toBe(runtimeDb.openDb);
  });
});
