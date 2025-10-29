import { afterEach, beforeEach, describe, expect, test, jest } from '@jest/globals';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const START_MODULE_PATH = '../../app/services/registry/start.mjs';
const SERVER_MODULE_PATH = '../../app/services/registry/server.mjs';

async function importStartModule() {
  return import(START_MODULE_PATH);
}

describe('app/services/registry/start.mjs', () => {
  let originalProcessOn;
  let tempRoot;

  beforeEach(async () => {
    jest.resetModules();
    originalProcessOn = process.on;
    tempRoot = await mkdtemp(path.join(tmpdir(), 'registry-start-'));
    delete process.env.REGISTRY_API_KEY;
    delete process.env.OSSP_IAM_POLICY;
    delete process.env.OSSP_IAM_AUDIT_LOG;
    delete process.env.OSSP_AGI_SILENCE_REGISTRY_DEPRECATION;
  });

  afterEach(async () => {
    process.on = originalProcessOn;
    jest.restoreAllMocks();
    await rm(tempRoot, { recursive: true, force: true });
    delete process.env.REGISTRY_API_KEY;
    delete process.env.OSSP_IAM_POLICY;
    delete process.env.OSSP_IAM_AUDIT_LOG;
    delete process.env.OSSP_AGI_SILENCE_REGISTRY_DEPRECATION;
  });

  test('resolveIamPolicyPath respects overrides and defaults', async () => {
    process.env.OSSP_AGI_SILENCE_REGISTRY_DEPRECATION = '1';
    const { resolveIamPolicyPath } = await importStartModule();

    const defaultPath = resolveIamPolicyPath();
    expect(defaultPath).toBe(path.resolve(process.cwd(), 'app/config/security/delegation-policy.json'));

    const customPolicy = path.join(tempRoot, 'policy.json');
    await writeFile(customPolicy, '{}', 'utf8');
    process.env.OSSP_IAM_POLICY = customPolicy;
    const resolvedPolicy = resolveIamPolicyPath();
    expect(resolvedPolicy).toBe(path.resolve(process.cwd(), customPolicy));
  });

  test('resolveIamAuditPath respects overrides and defaults', async () => {
    process.env.OSSP_AGI_SILENCE_REGISTRY_DEPRECATION = '1';
    const { resolveIamAuditPath } = await importStartModule();

    const defaultPath = resolveIamAuditPath();
    expect(defaultPath).toBe(path.resolve(process.cwd(), 'artifacts/security/denials.jsonl'));

    const customAudit = path.join(tempRoot, 'audit.log');
    process.env.OSSP_IAM_AUDIT_LOG = customAudit;
    const resolvedAudit = resolveIamAuditPath();
    expect(resolvedAudit).toBe(path.resolve(process.cwd(), customAudit));
  });

  test('emitStartupChecklist logs warnings when prerequisites are missing', async () => {
    process.env.OSSP_AGI_SILENCE_REGISTRY_DEPRECATION = '1';
    process.env.OSSP_IAM_POLICY = path.join(tempRoot, 'missing-policy.json');
    process.env.OSSP_IAM_AUDIT_LOG = path.join(tempRoot, 'missing', 'denials.jsonl');
    const { emitStartupChecklist } = await importStartModule();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await emitStartupChecklist('test-key');

    const messages = logSpy.mock.calls.map(([message]) => message);
    expect(messages.some((msg) => msg.includes('IAM policy file not found'))).toBe(true);
    expect(messages.some((msg) => msg.includes('Resolve the warnings above'))).toBe(true);

    logSpy.mockRestore();
  });

  test('emitStartupChecklist logs success when prerequisites are satisfied', async () => {
    process.env.OSSP_AGI_SILENCE_REGISTRY_DEPRECATION = '1';
    const policyDir = path.join(tempRoot, 'config');
    const auditDir = path.join(tempRoot, 'audit');
    await mkdir(policyDir, { recursive: true });
    await mkdir(auditDir, { recursive: true });

    const policyFile = path.join(policyDir, 'policy.json');
    await writeFile(policyFile, '{}', 'utf8');
    const auditFile = path.join(auditDir, 'denials.jsonl');

    process.env.OSSP_IAM_POLICY = policyFile;
    process.env.OSSP_IAM_AUDIT_LOG = auditFile;

    const { emitStartupChecklist } = await importStartModule();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await emitStartupChecklist('secure-key');

    const messages = logSpy.mock.calls.map(([message]) => message);
    expect(messages.some((msg) => msg.includes('IAM policy located at'))).toBe(true);
    expect(messages.some((msg) => msg.includes('IAM audit log directory writable'))).toBe(true);
    expect(messages.some((msg) => msg.includes('All security prerequisites satisfied'))).toBe(true);

    logSpy.mockRestore();
  });

  test('main exits with error when REGISTRY_API_KEY is missing', async () => {
    process.env.OSSP_AGI_SILENCE_REGISTRY_DEPRECATION = '1';
    const { main } = await importStartModule();
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await main();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('SECURITY ERROR'));
  });

  test('main starts server and registers signal handlers on success', async () => {
    jest.resetModules();
    const startServerMock = jest.fn().mockResolvedValue({
      close: jest.fn().mockResolvedValue(),
      port: 3200,
      host: '0.0.0.0'
    });

    const policyDir = path.join(tempRoot, 'config');
    const auditDir = path.join(tempRoot, 'audit');
    await mkdir(policyDir, { recursive: true });
    await mkdir(auditDir, { recursive: true });

    const policyFile = path.join(policyDir, 'policy.json');
    await writeFile(policyFile, '{}', 'utf8');
    const auditFile = path.join(auditDir, 'denials.jsonl');
    await writeFile(auditFile, '', 'utf8');

    process.env.OSSP_AGI_SILENCE_REGISTRY_DEPRECATION = '1';
    process.env.REGISTRY_API_KEY = 'super-secure-api-key';

    jest.unstable_mockModule(SERVER_MODULE_PATH, () => ({
      startServer: startServerMock
    }));

    const { main } = await importStartModule();

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const processOnSpy = jest.spyOn(process, 'on').mockImplementation(() => process);

    process.env.OSSP_AGI_SILENCE_REGISTRY_DEPRECATION = '1';
    process.env.OSSP_IAM_POLICY = policyFile;
    process.env.OSSP_IAM_AUDIT_LOG = auditFile;

    await main();

    expect(startServerMock).toHaveBeenCalledWith({
      port: 3000,
      apiKey: 'super-secure-api-key'
    });
    expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(errorSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Starting Registry Server on port 3000'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Registry Server started successfully on http://0.0.0.0:3200'));

    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    processOnSpy.mockRestore();
  });
});
