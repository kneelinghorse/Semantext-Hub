/**
 * Structured Logger Tests
 * 
 * Tests for the structured logging implementation.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  StructuredLogger,
  LoggerManager,
  LogEntry,
  TraceEntry,
  LOG_LEVELS,
  DEFAULT_CONFIG,
  createStructuredLogger,
  createLoggerManager,
  defaultLogger,
  log,
  tracing,
  context
} from '../../packages/runtime/runtime/structured-logger.js';

describe('Log Entry', () => {
  test('should create log entry with proper structure', () => {
    const entry = new LogEntry(LOG_LEVELS.INFO, 'Test message', {
      correlationId: 'corr-123',
      requestId: 'req-456',
      component: 'TestComponent'
    });

    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeDefined();
    expect(entry.level).toBe(LOG_LEVELS.INFO);
    expect(entry.levelName).toBe('INFO');
    expect(entry.message).toBe('Test message');
    expect(entry.correlationId).toBe('corr-123');
    expect(entry.requestId).toBe('req-456');
    expect(entry.component).toBe('TestComponent');
  });

  test('should get correct level name', () => {
    const traceEntry = new LogEntry(LOG_LEVELS.TRACE, 'Trace message');
    const debugEntry = new LogEntry(LOG_LEVELS.DEBUG, 'Debug message');
    const infoEntry = new LogEntry(LOG_LEVELS.INFO, 'Info message');
    const warnEntry = new LogEntry(LOG_LEVELS.WARN, 'Warn message');
    const errorEntry = new LogEntry(LOG_LEVELS.ERROR, 'Error message');
    const fatalEntry = new LogEntry(LOG_LEVELS.FATAL, 'Fatal message');

    expect(traceEntry.levelName).toBe('TRACE');
    expect(debugEntry.levelName).toBe('DEBUG');
    expect(infoEntry.levelName).toBe('INFO');
    expect(warnEntry.levelName).toBe('WARN');
    expect(errorEntry.levelName).toBe('ERROR');
    expect(fatalEntry.levelName).toBe('FATAL');
  });

  test('should convert to JSON', () => {
    const entry = new LogEntry(LOG_LEVELS.INFO, 'Test message', {
      correlationId: 'corr-123',
      requestId: 'req-456'
    });

    const json = entry.toJSON();

    expect(json.id).toBeDefined();
    expect(json.timestamp).toBeDefined();
    expect(json.level).toBe(LOG_LEVELS.INFO);
    expect(json.levelName).toBe('INFO');
    expect(json.message).toBe('Test message');
    expect(json.correlationId).toBe('corr-123');
    expect(json.requestId).toBe('req-456');
  });

  test('should convert to text format', () => {
    const entry = new LogEntry(LOG_LEVELS.INFO, 'Test message', {
      correlationId: 'corr-123',
      requestId: 'req-456',
      component: 'TestComponent',
      operation: 'test',
      duration: 100
    });

    const text = entry.toText();

    expect(text).toContain('Test message');
    expect(text).toContain('[INFO]');
    expect(text).toContain('correlationId=corr-123');
    expect(text).toContain('requestId=req-456');
    expect(text).toContain('component=TestComponent');
    expect(text).toContain('operation=test');
    expect(text).toContain('duration=100ms');
  });

  test('should convert to compact format', () => {
    const entry = new LogEntry(LOG_LEVELS.INFO, 'Test message', {
      correlationId: 'corr-123',
      requestId: 'req-456',
      component: 'TestComponent',
      operation: 'test',
      duration: 100,
      extra: 'value'
    });

    const compact = entry.toCompact();

    expect(compact).toContain('Test message');
    expect(compact).toContain('[INFO]');
    expect(compact).toContain('extra=value');
  });

  test('should convert to string with specified format', () => {
    const entry = new LogEntry(LOG_LEVELS.INFO, 'Test message', {
      correlationId: 'corr-123'
    });

    const jsonString = entry.toString('json');
    const textString = entry.toString('text');
    const compactString = entry.toString('compact');

    expect(() => JSON.parse(jsonString)).not.toThrow();
    expect(textString).toContain('Test message');
    expect(compactString).toContain('Test message');
  });
});

describe('Trace Entry', () => {
  test('should create trace entry with proper structure', () => {
    const trace = new TraceEntry('test-operation', {
      correlationId: 'corr-123',
      requestId: 'req-456',
      component: 'TestComponent'
    });

    expect(trace.id).toBeDefined();
    expect(trace.operation).toBe('test-operation');
    expect(trace.startTime).toBeDefined();
    expect(trace.endTime).toBeNull();
    expect(trace.duration).toBeNull();
    expect(trace.status).toBe('started');
    expect(trace.correlationId).toBe('corr-123');
    expect(trace.requestId).toBe('req-456');
    expect(trace.component).toBe('TestComponent');
  });

  test('should complete trace entry', () => {
    const trace = new TraceEntry('test-operation', {
      correlationId: 'corr-123'
    });

    const startTime = trace.startTime;
    
    // Simulate some time passing
    setTimeout(() => {
      trace.complete('completed', { result: 'success' });
    }, 10);

    expect(trace.endTime).toBeGreaterThan(startTime);
    expect(trace.duration).toBeGreaterThan(0);
    expect(trace.status).toBe('completed');
    expect(trace.result).toEqual({ result: 'success' });
  });

  test('should convert to JSON', () => {
    const trace = new TraceEntry('test-operation', {
      correlationId: 'corr-123',
      requestId: 'req-456'
    });

    trace.complete('completed', { result: 'success' });

    const json = trace.toJSON();

    expect(json.id).toBeDefined();
    expect(json.operation).toBe('test-operation');
    expect(json.startTime).toBeDefined();
    expect(json.endTime).toBeDefined();
    expect(json.duration).toBeGreaterThan(0);
    expect(json.status).toBe('completed');
    expect(json.result).toEqual({ result: 'success' });
  });
});

describe('Structured Logger', () => {
  let logger;

  beforeEach(() => {
    logger = createStructuredLogger({
      level: LOG_LEVELS.INFO,
      enableConsole: false,
      enableFile: false,
      enableMetrics: true,
      enableTracing: true
    });
  });

  afterEach(() => {
    logger.resetMetrics();
  });

  describe('Logging Methods', () => {
    test('should log trace message', () => {
      const logSpy = jest.spyOn(logger, 'log');
      logger.trace('Trace message', { test: true });

      expect(logSpy).toHaveBeenCalledWith(LOG_LEVELS.TRACE, 'Trace message', { test: true });
    });

    test('should log debug message', () => {
      const logSpy = jest.spyOn(logger, 'log');
      logger.debug('Debug message', { test: true });

      expect(logSpy).toHaveBeenCalledWith(LOG_LEVELS.DEBUG, 'Debug message', { test: true });
    });

    test('should log info message', () => {
      const logSpy = jest.spyOn(logger, 'log');
      logger.info('Info message', { test: true });

      expect(logSpy).toHaveBeenCalledWith(LOG_LEVELS.INFO, 'Info message', { test: true });
    });

    test('should log warn message', () => {
      const logSpy = jest.spyOn(logger, 'log');
      logger.warn('Warn message', { test: true });

      expect(logSpy).toHaveBeenCalledWith(LOG_LEVELS.WARN, 'Warn message', { test: true });
    });

    test('should log error message', () => {
      const logSpy = jest.spyOn(logger, 'log');
      logger.error('Error message', { test: true });

      expect(logSpy).toHaveBeenCalledWith(LOG_LEVELS.ERROR, 'Error message', { test: true });
    });

    test('should log fatal message', () => {
      const logSpy = jest.spyOn(logger, 'log');
      logger.fatal('Fatal message', { test: true });

      expect(logSpy).toHaveBeenCalledWith(LOG_LEVELS.FATAL, 'Fatal message', { test: true });
    });
  });

  describe('Log Level Filtering', () => {
    test('should filter messages below current level', () => {
      const logSpy = jest.spyOn(logger, 'log');
      
      logger.trace('Trace message');
      logger.debug('Debug message');
      logger.info('Info message');

      expect(logSpy).toHaveBeenCalledTimes(1); // Only info message should be logged
    });

    test('should log messages at or above current level', () => {
      logger.setLevel(LOG_LEVELS.WARN);
      const logSpy = jest.spyOn(logger, 'log');
      
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      expect(logSpy).toHaveBeenCalledTimes(2); // Warn and error messages
    });
  });

  describe('Request Tracing', () => {
    test('should start trace', () => {
      const traceId = logger.startTrace('test-operation', {
        correlationId: 'corr-123',
        requestId: 'req-456'
      });

      expect(traceId).toBeDefined();
      expect(logger.getTrace(traceId)).toBeDefined();
      expect(logger.getTrace(traceId).operation).toBe('test-operation');
    });

    test('should complete trace', () => {
      const traceId = logger.startTrace('test-operation', {
        correlationId: 'corr-123'
      });

      logger.completeTrace(traceId, 'completed', { result: 'success' });

      expect(logger.getTrace(traceId)).toBeNull(); // Trace should be removed
    });

    test('should get active traces', () => {
      const traceId1 = logger.startTrace('operation1');
      const traceId2 = logger.startTrace('operation2');

      const activeTraces = logger.getActiveTraces();

      expect(activeTraces).toHaveLength(2);
      expect(activeTraces.some(trace => trace.operation === 'operation1')).toBe(true);
      expect(activeTraces.some(trace => trace.operation === 'operation2')).toBe(true);
    });

    test('should handle trace not found', () => {
      logger.completeTrace('non-existent-trace', 'completed');

      // Should not throw error
      expect(true).toBe(true);
    });
  });

  describe('Context Creation', () => {
    test('should create correlation ID', () => {
      const correlationId = logger.createCorrelationId();

      expect(correlationId).toBeDefined();
      expect(typeof correlationId).toBe('string');
      expect(correlationId.length).toBeGreaterThan(0);
    });

    test('should create request ID', () => {
      const requestId = logger.createRequestId();

      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');
      expect(requestId.length).toBeGreaterThan(0);
    });

    test('should create context with IDs', () => {
      const context = logger.createContext({
        component: 'TestComponent',
        operation: 'test'
      });

      expect(context.correlationId).toBeDefined();
      expect(context.requestId).toBeDefined();
      expect(context.component).toBe('TestComponent');
      expect(context.operation).toBe('test');
      expect(context.timestamp).toBeDefined();
    });

    test('should use existing IDs in context', () => {
      const context = logger.createContext({
        correlationId: 'existing-corr-id',
        requestId: 'existing-req-id',
        component: 'TestComponent'
      });

      expect(context.correlationId).toBe('existing-corr-id');
      expect(context.requestId).toBe('existing-req-id');
      expect(context.component).toBe('TestComponent');
    });
  });

  describe('Logger Metrics', () => {
    test('should track log metrics', () => {
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      const metrics = logger.getMetrics();

      expect(metrics.totalLogs).toBe(3);
      expect(metrics.logsByLevel.INFO).toBe(1);
      expect(metrics.logsByLevel.WARN).toBe(1);
      expect(metrics.logsByLevel.ERROR).toBe(1);
    });

    test('should track trace metrics', () => {
      const traceId = logger.startTrace('test-operation');
      logger.completeTrace(traceId, 'completed');

      const metrics = logger.getMetrics();

      expect(metrics.totalTraces).toBe(1);
      expect(metrics.completedTraces).toBe(1);
      expect(metrics.averageTraceDuration).toBeGreaterThan(0);
    });

    test('should reset metrics', () => {
      logger.info('Info message');
      logger.startTrace('test-operation');

      let metrics = logger.getMetrics();
      expect(metrics.totalLogs).toBe(1);
      expect(metrics.totalTraces).toBe(1);

      logger.resetMetrics();

      metrics = logger.getMetrics();
      expect(metrics.totalLogs).toBe(0);
      expect(metrics.totalTraces).toBe(0);
    });
  });

  describe('Logger Configuration', () => {
    test('should set and get log level', () => {
      expect(logger.getLevel()).toBe(LOG_LEVELS.INFO);

      logger.setLevel(LOG_LEVELS.WARN);
      expect(logger.getLevel()).toBe(LOG_LEVELS.WARN);
    });
  });

  describe('Logger Events', () => {
    test('should emit log events', () => {
      const logSpy = jest.fn();
      logger.on('log', logSpy);

      logger.info('Test message', { test: true });

      expect(logSpy).toHaveBeenCalledWith(expect.any(LogEntry));
    });

    test('should emit file output events when file logging enabled', () => {
      const fileOutputSpy = jest.fn();
      logger.on('fileOutput', fileOutputSpy);

      // Enable file logging
      logger.config.enableFile = true;
      logger.info('Test message');

      expect(fileOutputSpy).toHaveBeenCalledWith(expect.any(LogEntry));
    });
  });
});

describe('Logger Manager', () => {
  let manager;

  beforeEach(() => {
    manager = createLoggerManager({
      level: LOG_LEVELS.INFO,
      enableConsole: false,
      enableLogging: false
    });
  });

  afterEach(() => {
    manager.clear();
  });

  describe('Logger Management', () => {
    test('should get or create logger', () => {
      const logger1 = manager.getLogger('logger1');
      const logger2 = manager.getLogger('logger1');
      const logger3 = manager.getLogger('logger2');

      expect(logger1).toBe(logger2); // Same instance
      expect(logger1).not.toBe(logger3); // Different instance
      expect(logger1).toBeInstanceOf(StructuredLogger);
      expect(logger3).toBeInstanceOf(StructuredLogger);
    });

    test('should get all loggers', () => {
      manager.getLogger('logger1');
      manager.getLogger('logger2');

      const allLoggers = manager.getAllLoggers();

      expect(allLoggers.logger1).toBeDefined();
      expect(allLoggers.logger2).toBeDefined();
      expect(allLoggers.logger1).toBeInstanceOf(StructuredLogger);
      expect(allLoggers.logger2).toBeInstanceOf(StructuredLogger);
    });

    test('should get metrics for all loggers', () => {
      const logger1 = manager.getLogger('logger1');
      const logger2 = manager.getLogger('logger2');

      logger1.info('Info message');
      logger2.warn('Warn message');

      const allMetrics = manager.getAllMetrics();

      expect(allMetrics.logger1).toBeDefined();
      expect(allMetrics.logger2).toBeDefined();
      expect(allMetrics.logger1.totalLogs).toBe(1);
      expect(allMetrics.logger2.totalLogs).toBe(1);
    });
  });

  describe('Manager Operations', () => {
    test('should set global log level', () => {
      const logger1 = manager.getLogger('logger1');
      const logger2 = manager.getLogger('logger2');

      manager.setGlobalLevel(LOG_LEVELS.WARN);

      expect(logger1.getLevel()).toBe(LOG_LEVELS.WARN);
      expect(logger2.getLevel()).toBe(LOG_LEVELS.WARN);
    });

    test('should remove logger', () => {
      const logger1 = manager.getLogger('logger1');
      expect(logger1).toBeDefined();

      manager.removeLogger('logger1');

      const logger2 = manager.getLogger('logger1');
      expect(logger2).not.toBe(logger1); // New instance created
    });

    test('should clear all loggers', () => {
      manager.getLogger('logger1');
      manager.getLogger('logger2');

      expect(manager.getAllLoggers()).toHaveProperty('logger1');
      expect(manager.getAllLoggers()).toHaveProperty('logger2');

      manager.clear();

      expect(manager.getAllLoggers()).toEqual({});
    });
  });

  describe('Manager Events', () => {
    test('should emit log events from managed loggers', () => {
      const logSpy = jest.fn();
      manager.on('log', logSpy);

      const logger = manager.getLogger('test-logger');
      logger.info('Test message');

      expect(logSpy).toHaveBeenCalledWith({
        loggerName: 'test-logger',
        entry: expect.any(LogEntry)
      });
    });
  });
});

describe('Default Logger', () => {
  test('should create default logger instance', () => {
    expect(defaultLogger).toBeInstanceOf(StructuredLogger);
    expect(defaultLogger.getLevel()).toBe(LOG_LEVELS.INFO);
  });
});

describe('Convenience Functions', () => {
  test('should provide convenience log functions', () => {
    const logSpy = jest.spyOn(defaultLogger, 'log');

    log.trace('Trace message');
    log.debug('Debug message');
    log.info('Info message');
    log.warn('Warn message');
    log.error('Error message');
    log.fatal('Fatal message');

    expect(logSpy).toHaveBeenCalledTimes(6);
  });

  test('should provide convenience tracing functions', () => {
    const startTraceSpy = jest.spyOn(defaultLogger, 'startTrace');
    const completeTraceSpy = jest.spyOn(defaultLogger, 'completeTrace');
    const getActiveSpy = jest.spyOn(defaultLogger, 'getActiveTraces');
    const getSpy = jest.spyOn(defaultLogger, 'getTrace');

    tracing.start('test-operation');
    tracing.complete('trace-id', 'completed');
    tracing.getActive();
    tracing.get('trace-id');

    expect(startTraceSpy).toHaveBeenCalledWith('test-operation', undefined);
    expect(completeTraceSpy).toHaveBeenCalledWith('trace-id', 'completed', undefined);
    expect(getActiveSpy).toHaveBeenCalled();
    expect(getSpy).toHaveBeenCalledWith('trace-id');
  });

  test('should provide convenience context functions', () => {
    const createCorrelationIdSpy = jest.spyOn(defaultLogger, 'createCorrelationId');
    const createRequestIdSpy = jest.spyOn(defaultLogger, 'createRequestId');
    const createContextSpy = jest.spyOn(defaultLogger, 'createContext');

    context.createCorrelationId();
    context.createRequestId();
    context.create({ test: true });

    expect(createCorrelationIdSpy).toHaveBeenCalled();
    expect(createRequestIdSpy).toHaveBeenCalled();
    expect(createContextSpy).toHaveBeenCalledWith({ test: true });
  });
});

describe('Log Levels', () => {
  test('should export correct log levels', () => {
    expect(LOG_LEVELS.TRACE).toBe(0);
    expect(LOG_LEVELS.DEBUG).toBe(1);
    expect(LOG_LEVELS.INFO).toBe(2);
    expect(LOG_LEVELS.WARN).toBe(3);
    expect(LOG_LEVELS.ERROR).toBe(4);
    expect(LOG_LEVELS.FATAL).toBe(5);
  });
});

describe('Default Configuration', () => {
  test('should export default configuration', () => {
    expect(DEFAULT_CONFIG.level).toBe(LOG_LEVELS.INFO);
    expect(DEFAULT_CONFIG.enableConsole).toBe(true);
    expect(DEFAULT_CONFIG.enableFile).toBe(false);
    expect(DEFAULT_CONFIG.enableMetrics).toBe(true);
    expect(DEFAULT_CONFIG.enableTracing).toBe(true);
    expect(DEFAULT_CONFIG.maxTraceSize).toBe(1000);
    expect(DEFAULT_CONFIG.correlationIdHeader).toBe('x-correlation-id');
    expect(DEFAULT_CONFIG.requestIdHeader).toBe('x-request-id');
    expect(DEFAULT_CONFIG.timestampFormat).toBe('iso');
    expect(DEFAULT_CONFIG.logFormat).toBe('json');
  });
});
