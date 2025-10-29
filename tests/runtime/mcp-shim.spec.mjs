import { describe, it, expect } from '@jest/globals';
import { __testUtils } from '../../packages/runtime/bin/mcp/shim.js';

const { extractRequestId } = __testUtils;

describe('MCP shim request id recovery', () => {
  it('recovers numeric ids from malformed JSON', () => {
    const line = '{"jsonrpc":"2.0","id":42,"method":"doSomething"';
    expect(extractRequestId(line)).toBe(42);
  });

  it('recovers string ids with escaping', () => {
    const line = '{"jsonrpc":"2.0","id":"task-\\"alpha\\"","method":"doSomething"';
    expect(extractRequestId(line)).toBe('task-"alpha"');
  });

  it('recovers ids declared with single quotes', () => {
    const line = "{'jsonrpc':'2.0','id':'abc-123','method':'doSomething'";
    expect(extractRequestId(line)).toBe('abc-123');
  });

  it('preserves explicit null ids', () => {
    const line = '{"jsonrpc":"2.0","id":null,"method":"doSomething"';
    expect(extractRequestId(line)).toBeNull();
  });

  it('returns undefined when no id can be found', () => {
    const line = '{"jsonrpc":"2.0","method":"doSomething"';
    expect(extractRequestId(line)).toBeUndefined();
  });
});
