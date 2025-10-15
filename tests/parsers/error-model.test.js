/**
 * Tests for Parser Error Model
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ParserError, ErrorCollector, createError, wrapError } from '../../packages/protocols/parsers/utils/error-model.js';
import { ERROR_CODES, getErrorMeta, getErrorsByDomain, getErrorsBySeverity } from '../../packages/protocols/parsers/utils/error-codes.js';

describe('ParserError', () => {
  it('should create error with default metadata', () => {
    const error = new ParserError('REF_001');

    expect(error.code).toBe('REF_001');
    expect(error.message).toBe('External reference resolution failed');
    expect(error.severity).toBe('ERROR');
    expect(error.recoverable).toBe(true);
    expect(error.suggestion).toBeTruthy();
    expect(error.timestamp).toBeTruthy();
  });

  it('should create error with custom message', () => {
    const error = new ParserError('REF_001', 'Custom error message');

    expect(error.message).toBe('Custom error message');
    expect(error.code).toBe('REF_001');
  });

  it('should create error with context', () => {
    const error = new ParserError('REF_004', null, {
      path: '#/components/schemas/User',
      location: { line: 42, column: 10 },
      metadata: { ref: 'User' }
    });

    expect(error.path).toBe('#/components/schemas/User');
    expect(error.location).toEqual({ line: 42, column: 10 });
    expect(error.metadata.ref).toBe('User');
  });

  it('should serialize to JSON correctly', () => {
    const error = new ParserError('SCHEMA_001', 'Invalid schema', {
      path: '#/components/schemas/Pet'
    });

    const json = error.toJSON();

    expect(json.code).toBe('SCHEMA_001');
    expect(json.message).toBe('Invalid schema');
    expect(json.path).toBe('#/components/schemas/Pet');
    expect(json.severity).toBe('ERROR');
    expect(json.timestamp).toBeTruthy();
  });

  it('should format error message correctly', () => {
    const error = new ParserError('REF_004', 'Schema not found', {
      path: '#/components/schemas/User',
      location: { line: 10, column: 5 }
    });

    const formatted = error.format();

    expect(formatted).toContain('[REF_004]');
    expect(formatted).toContain('Schema not found');
    expect(formatted).toContain('#/components/schemas/User');
    expect(formatted).toContain('line 10');
    expect(formatted).toContain('col 5');
    expect(formatted).toContain('Suggestion:');
  });

  it('should identify recoverable errors', () => {
    const recoverable = new ParserError('REF_001');
    const fatal = new ParserError('PARSE_003');

    expect(recoverable.isRecoverable()).toBe(true);
    expect(fatal.isRecoverable()).toBe(false);
  });

  it('should identify fatal errors', () => {
    const fatal = new ParserError('PARSE_003');
    const warning = new ParserError('OPENAPI_004');

    expect(fatal.isFatal()).toBe(true);
    expect(warning.isFatal()).toBe(false);
  });
});

describe('ErrorCollector', () => {
  let collector;

  beforeEach(() => {
    collector = new ErrorCollector();
  });

  it('should collect errors by severity', () => {
    collector.add(new ParserError('REF_001'));
    collector.add(new ParserError('OPENAPI_004'));
    collector.add(new ParserError('GENERAL_002'));

    expect(collector.errors.length).toBe(1);
    expect(collector.warnings.length).toBe(1);
    expect(collector.infos.length).toBe(1);
  });

  it('should enforce max errors limit', () => {
    const limitedCollector = new ErrorCollector({ maxErrors: 2 });

    limitedCollector.add(new ParserError('REF_001'));
    limitedCollector.add(new ParserError('REF_002'));
    limitedCollector.add(new ParserError('REF_003'));

    expect(limitedCollector.errors.length).toBe(2);
  });

  it('should detect fatal errors', () => {
    collector.add(new ParserError('REF_001'));
    expect(collector.hasFatalErrors()).toBe(false);

    collector.add(new ParserError('PARSE_003'));
    expect(collector.hasFatalErrors()).toBe(true);
  });

  it('should get errors by severity', () => {
    collector.add(new ParserError('REF_001'));
    collector.add(new ParserError('OPENAPI_004'));

    const errors = collector.getBySeverity('ERROR');
    const warnings = collector.getBySeverity('WARN');

    expect(errors.length).toBe(1);
    expect(warnings.length).toBe(1);
  });

  it('should get errors by code', () => {
    collector.add(new ParserError('REF_001'));
    collector.add(new ParserError('REF_001', 'Second occurrence'));
    collector.add(new ParserError('REF_002'));

    const ref001Errors = collector.getByCode('REF_001');

    expect(ref001Errors.length).toBe(2);
  });

  it('should provide summary', () => {
    collector.add(new ParserError('REF_001'));
    collector.add(new ParserError('OPENAPI_004'));
    collector.add(new ParserError('PARSE_003'));

    const summary = collector.getSummary();

    expect(summary.total).toBe(3);
    expect(summary.errors).toBe(2);
    expect(summary.warnings).toBe(1);
    expect(summary.hasFatal).toBe(true);
    expect(summary.recoverable).toBe(1);
  });

  it('should clear all errors', () => {
    collector.add(new ParserError('REF_001'));
    collector.add(new ParserError('OPENAPI_004'));

    collector.clear();

    expect(collector.errors.length).toBe(0);
    expect(collector.warnings.length).toBe(0);
    expect(collector.hasErrors()).toBe(false);
  });

  it('should throw on error in stopOnError mode', () => {
    const throwingCollector = new ErrorCollector({ stopOnError: true });
    const fatalError = new ParserError('PARSE_003');

    expect(() => {
      throwingCollector.add(fatalError);
    }).toThrow();
  });

  it('should wrap native errors', () => {
    const nativeError = new Error('Something went wrong');

    collector.add(nativeError);

    expect(collector.errors.length).toBe(1);
    expect(collector.errors[0].code).toBe('GENERAL_001');
    expect(collector.errors[0].metadata.originalError).toBeDefined();
  });
});

describe('Error Helper Functions', () => {
  it('should create error with createError', () => {
    const error = createError('REF_003', 'Invalid URI format');

    expect(error).toBeInstanceOf(ParserError);
    expect(error.code).toBe('REF_003');
    expect(error.message).toBe('Invalid URI format');
  });

  it('should wrap error with wrapError', () => {
    const nativeError = new Error('File not found');
    const wrapped = wrapError(nativeError, 'PARSE_003', {
      path: '/path/to/file.json'
    });

    expect(wrapped).toBeInstanceOf(ParserError);
    expect(wrapped.code).toBe('PARSE_003');
    expect(wrapped.path).toBe('/path/to/file.json');
    expect(wrapped.metadata.originalError).toBeDefined();
    expect(wrapped.metadata.originalError.message).toBe('File not found');
  });
});

describe('Error Codes Registry', () => {
  it('should have all required error codes', () => {
    expect(ERROR_CODES.OPENAPI_001).toBeDefined();
    expect(ERROR_CODES.REF_001).toBeDefined();
    expect(ERROR_CODES.SCHEMA_001).toBeDefined();
    expect(ERROR_CODES.NET_001).toBeDefined();
    expect(ERROR_CODES.PARSE_001).toBeDefined();
    expect(ERROR_CODES.GENERAL_001).toBeDefined();
  });

  it('should get error metadata by code', () => {
    const meta = getErrorMeta('REF_001');

    expect(meta.code).toBe('REF_001');
    expect(meta.message).toBeTruthy();
    expect(meta.severity).toBeTruthy();
    expect(meta.suggestion).toBeTruthy();
  });

  it('should get errors by domain', () => {
    const refErrors = getErrorsByDomain('REF');

    expect(refErrors.length).toBeGreaterThan(0);
    expect(refErrors.every(e => e.code.startsWith('REF'))).toBe(true);
  });

  it('should get errors by severity', () => {
    const errors = getErrorsBySeverity('ERROR');
    const warnings = getErrorsBySeverity('WARN');

    expect(errors.length).toBeGreaterThan(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(errors.every(e => e.severity === 'ERROR')).toBe(true);
    expect(warnings.every(e => e.severity === 'WARN')).toBe(true);
  });

  it('should return default for unknown error code', () => {
    const meta = getErrorMeta('UNKNOWN_999');

    expect(meta.code).toBe('GENERAL_001');
    expect(meta.message).toContain('Unknown error');
  });
});
