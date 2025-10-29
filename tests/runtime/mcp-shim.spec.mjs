import { describe, it, expect } from '@jest/globals';
import { __testUtils } from '../../packages/runtime/bin/mcp/shim.js';

const { extractRequestId, recoverPartialRequestContext, buildMalformedJsonErrorPayload } = __testUtils;

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

  it('prefers top-level ids when nested ids are present', () => {
    const line = '{"jsonrpc":"2.0","params":{"id":null},"id":"primary-123","method":"doSomething"';
    expect(extractRequestId(line)).toBe('primary-123');
  });

  it('returns undefined when no id can be found', () => {
    const line = '{"jsonrpc":"2.0","method":"doSomething"';
    expect(extractRequestId(line)).toBeUndefined();
  });

  it('recovers ids from unterminated string values', () => {
    const line = '{"jsonrpc":"2.0","id":"abc-123';
    expect(extractRequestId(line)).toBe('abc-123');
  });
});

describe('recoverPartialRequestContext', () => {
  it('returns recovered fields when available', () => {
    const line = '{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"name":"demo"';
    expect(recoverPartialRequestContext(line)).toEqual({
      id: 99,
      jsonrpc: '2.0',
      method: 'tools/call',
    });
  });

  it('omits missing fields gracefully', () => {
    const line = '{"id":null,"params":{}';
    expect(recoverPartialRequestContext(line)).toEqual({ id: null });
  });
});

describe('buildMalformedJsonErrorPayload', () => {
  it('includes recovered context and raw excerpt in the error response', () => {
    const line = '{"jsonrpc":"2.0","id":"job-9","method":"tools/call","params":{"value":1}';
    const parseError = new SyntaxError('Unexpected token } in JSON at position 57');

    const { errorResponse, logContext } = buildMalformedJsonErrorPayload(line, parseError);

    expect(errorResponse.id).toBe('job-9');
    expect(errorResponse.error.code).toBe(-32700);
    expect(errorResponse.error.message).toBe('Malformed JSON request: Unexpected token } in JSON at position 57');
    expect(errorResponse.error.data).toEqual(
      expect.objectContaining({
        rawExcerpt: expect.any(String),
        position: 57,
        recoveredFields: expect.objectContaining({
          jsonrpc: '2.0',
          method: 'tools/call',
        }),
      }),
    );
    expect(errorResponse.error.data).not.toHaveProperty('rawTruncated');

    expect(logContext).toEqual(
      expect.objectContaining({
        error: parseError,
        requestId: 'job-9',
        method: 'tools/call',
        rawExcerpt: expect.any(String),
        position: 57,
      }),
    );
    expect(logContext).not.toHaveProperty('rawTruncated');
  });

  it('handles parse errors without position hints', () => {
    const line = '{"jsonrpc":"2.0","method":"doSomething"';
    const parseError = new SyntaxError('Unexpected end of JSON input');

    const { errorResponse, logContext } = buildMalformedJsonErrorPayload(line, parseError);

    expect(errorResponse.id).toBeNull();
    expect(errorResponse.error.message).toBe('Malformed JSON request: Unexpected end of JSON input');
    expect(errorResponse.error.data).toEqual(
      expect.objectContaining({
        rawExcerpt: line,
      }),
    );
    expect(errorResponse.error.data).not.toHaveProperty('position');

    expect(logContext).toEqual(
      expect.objectContaining({
        error: parseError,
        requestId: undefined,
        rawExcerpt: line,
      }),
    );
    expect(logContext).not.toHaveProperty('rawTruncated');
  });
});
