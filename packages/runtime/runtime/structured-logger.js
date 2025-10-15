/**
 * Structured Logger Implementation
 * 
 * Provides structured logging with correlation IDs, request tracing,
 * and configurable log levels and formats.
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

/**
 * Log levels
 */
export const LOG_LEVELS = {
  TRACE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
  FATAL: 5
};

/**
 * Default logger configuration
 */
export const DEFAULT_CONFIG = {
  level: LOG_LEVELS.INFO,
  enableConsole: true,
  enableFile: false,
  enableMetrics: true,
  enableTracing: true,
  maxTraceSize: 1000,
  correlationIdHeader: 'x-correlation-id',
  requestIdHeader: 'x-request-id',
  timestampFormat: 'iso',
  logFormat: 'json'
};

/**
 * Log entry structure
 */
export class LogEntry {
  constructor(level, message, context = {}) {
    this.id = randomUUID();
    this.timestamp = new Date().toISOString();
    this.level = level;
    this.levelName = this.getLevelName(level);
    this.message = message;
    this.context = context;
    this.correlationId = context.correlationId;
    this.requestId = context.requestId;
    this.component = context.component;
    this.operation = context.operation;
    this.duration = context.duration;
    this.metadata = context.metadata || {};
  }

  /**
   * Get level name from level number
   * @param {number} level - Log level
   * @returns {string} Level name
   */
  getLevelName(level) {
    const levelNames = {
      [LOG_LEVELS.TRACE]: 'TRACE',
      [LOG_LEVELS.DEBUG]: 'DEBUG',
      [LOG_LEVELS.INFO]: 'INFO',
      [LOG_LEVELS.WARN]: 'WARN',
      [LOG_LEVELS.ERROR]: 'ERROR',
      [LOG_LEVELS.FATAL]: 'FATAL'
    };
    return levelNames[level] || 'UNKNOWN';
  }

  /**
   * Convert to JSON-safe object
   * @returns {Object} JSON-safe log entry
   */
  toJSON() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      level: this.level,
      levelName: this.levelName,
      message: this.message,
      context: this.context,
      correlationId: this.correlationId,
      requestId: this.requestId,
      component: this.component,
      operation: this.operation,
      duration: this.duration,
      metadata: this.metadata
    };
  }

  /**
   * Convert to string format
   * @param {string} format - Output format
   * @returns {string} Formatted log entry
   */
  toString(format = 'json') {
    switch (format) {
      case 'json':
        return JSON.stringify(this.toJSON());
      case 'text':
        return this.toText();
      case 'compact':
        return this.toCompact();
      default:
        return JSON.stringify(this.toJSON());
    }
  }

  /**
   * Convert to text format
   * @returns {string} Text formatted log entry
   */
  toText() {
    const parts = [
      this.timestamp,
      `[${this.levelName}]`,
      this.message
    ];

    if (this.correlationId) {
      parts.push(`correlationId=${this.correlationId}`);
    }

    if (this.requestId) {
      parts.push(`requestId=${this.requestId}`);
    }

    if (this.component) {
      parts.push(`component=${this.component}`);
    }

    if (this.operation) {
      parts.push(`operation=${this.operation}`);
    }

    if (this.duration !== undefined) {
      parts.push(`duration=${this.duration}ms`);
    }

    return parts.join(' ');
  }

  /**
   * Convert to compact format
   * @returns {string} Compact formatted log entry
   */
  toCompact() {
    const contextStr = Object.keys(this.context)
      .filter(key => !['correlationId', 'requestId', 'component', 'operation', 'duration'].includes(key))
      .map(key => `${key}=${this.context[key]}`)
      .join(' ');

    return `${this.timestamp} [${this.levelName}] ${this.message} ${contextStr}`.trim();
  }
}

/**
 * Request trace entry
 */
export class TraceEntry {
  constructor(operation, context = {}) {
    this.id = randomUUID();
    this.operation = operation;
    this.startTime = Date.now();
    this.endTime = null;
    this.duration = null;
    this.context = context;
    this.correlationId = context.correlationId;
    this.requestId = context.requestId;
    this.component = context.component;
    this.status = 'started';
    this.metadata = context.metadata || {};
  }

  /**
   * Complete the trace
   * @param {string} status - Completion status
   * @param {Object} result - Result data
   */
  complete(status = 'completed', result = {}) {
    this.endTime = Date.now();
    this.duration = this.endTime - this.startTime;
    this.status = status;
    this.result = result;
  }

  /**
   * Convert to JSON-safe object
   * @returns {Object} JSON-safe trace entry
   */
  toJSON() {
    return {
      id: this.id,
      operation: this.operation,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      context: this.context,
      correlationId: this.correlationId,
      requestId: this.requestId,
      component: this.component,
      status: this.status,
      metadata: this.metadata,
      result: this.result
    };
  }
}

/**
 * Structured logger implementation
 */
export class StructuredLogger extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.traces = new Map();
    this.metrics = {
      totalLogs: 0,
      logsByLevel: {},
      totalTraces: 0,
      completedTraces: 0,
      averageTraceDuration: 0
    };
  }

  /**
   * Log a message
   * @param {number} level - Log level
   * @param {string} message - Log message
   * @param {Object} context - Log context
   */
  log(level, message, context = {}) {
    if (level < this.config.level) {
      return;
    }

    const entry = new LogEntry(level, message, context);
    
    // Update metrics
    this._updateMetrics(entry);
    
    // Emit log event
    this.emit('log', entry);
    
    // Output to console if enabled
    if (this.config.enableConsole) {
      this._outputToConsole(entry);
    }
    
    // Output to file if enabled
    if (this.config.enableFile) {
      this._outputToFile(entry);
    }
  }

  /**
   * Log trace level message
   * @param {string} message - Log message
   * @param {Object} context - Log context
   */
  trace(message, context = {}) {
    this.log(LOG_LEVELS.TRACE, message, context);
  }

  /**
   * Log debug level message
   * @param {string} message - Log message
   * @param {Object} context - Log context
   */
  debug(message, context = {}) {
    this.log(LOG_LEVELS.DEBUG, message, context);
  }

  /**
   * Log info level message
   * @param {string} message - Log message
   * @param {Object} context - Log context
   */
  info(message, context = {}) {
    this.log(LOG_LEVELS.INFO, message, context);
  }

  /**
   * Log warn level message
   * @param {string} message - Log message
   * @param {Object} context - Log context
   */
  warn(message, context = {}) {
    this.log(LOG_LEVELS.WARN, message, context);
  }

  /**
   * Log error level message
   * @param {string} message - Log message
   * @param {Object} context - Log context
   */
  error(message, context = {}) {
    this.log(LOG_LEVELS.ERROR, message, context);
  }

  /**
   * Log fatal level message
   * @param {string} message - Log message
   * @param {Object} context - Log context
   */
  fatal(message, context = {}) {
    this.log(LOG_LEVELS.FATAL, message, context);
  }

  /**
   * Start a request trace
   * @param {string} operation - Operation name
   * @param {Object} context - Trace context
   * @returns {string} Trace ID
   */
  startTrace(operation, context = {}) {
    if (!this.config.enableTracing) {
      return null;
    }

    const trace = new TraceEntry(operation, context);
    this.traces.set(trace.id, trace);
    
    this.metrics.totalTraces++;
    
    this.debug(`Trace started: ${operation}`, {
      traceId: trace.id,
      ...context
    });
    
    return trace.id;
  }

  /**
   * Complete a request trace
   * @param {string} traceId - Trace ID
   * @param {string} status - Completion status
   * @param {Object} result - Result data
   */
  completeTrace(traceId, status = 'completed', result = {}) {
    if (!this.config.enableTracing || !traceId) {
      return;
    }

    const trace = this.traces.get(traceId);
    if (!trace) {
      this.warn(`Trace not found: ${traceId}`);
      return;
    }

    trace.complete(status, result);
    this.traces.delete(traceId);
    
    this.metrics.completedTraces++;
    this._updateTraceMetrics(trace);
    
    this.debug(`Trace completed: ${trace.operation}`, {
      traceId,
      status,
      duration: trace.duration,
      ...result
    });
  }

  /**
   * Get active traces
   * @returns {Array} Active traces
   */
  getActiveTraces() {
    return Array.from(this.traces.values());
  }

  /**
   * Get trace by ID
   * @param {string} traceId - Trace ID
   * @returns {TraceEntry|null} Trace entry
   */
  getTrace(traceId) {
    return this.traces.get(traceId) || null;
  }

  /**
   * Create correlation ID
   * @returns {string} Correlation ID
   */
  createCorrelationId() {
    return randomUUID();
  }

  /**
   * Create request ID
   * @returns {string} Request ID
   */
  createRequestId() {
    return randomUUID();
  }

  /**
   * Create log context with correlation and request IDs
   * @param {Object} context - Base context
   * @returns {Object} Enhanced context
   */
  createContext(context = {}) {
    return {
      correlationId: context.correlationId || this.createCorrelationId(),
      requestId: context.requestId || this.createRequestId(),
      timestamp: new Date().toISOString(),
      ...context
    };
  }

  /**
   * Get logger metrics
   * @returns {Object} Logger metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeTraces: this.traces.size,
      config: this.config
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalLogs: 0,
      logsByLevel: {},
      totalTraces: 0,
      completedTraces: 0,
      averageTraceDuration: 0
    };
  }

  /**
   * Set log level
   * @param {number} level - Log level
   */
  setLevel(level) {
    this.config.level = level;
  }

  /**
   * Get current log level
   * @returns {number} Current log level
   */
  getLevel() {
    return this.config.level;
  }

  /**
   * Update metrics
   * @private
   * @param {LogEntry} entry - Log entry
   */
  _updateMetrics(entry) {
    this.metrics.totalLogs++;
    
    const levelName = entry.levelName;
    if (!this.metrics.logsByLevel[levelName]) {
      this.metrics.logsByLevel[levelName] = 0;
    }
    this.metrics.logsByLevel[levelName]++;
  }

  /**
   * Update trace metrics
   * @private
   * @param {TraceEntry} trace - Trace entry
   */
  _updateTraceMetrics(trace) {
    if (trace.duration !== null) {
      const totalDuration = this.metrics.averageTraceDuration * this.metrics.completedTraces;
      this.metrics.averageTraceDuration = (totalDuration + trace.duration) / this.metrics.completedTraces;
    }
  }

  /**
   * Output to console
   * @private
   * @param {LogEntry} entry - Log entry
   */
  _outputToConsole(entry) {
    const output = entry.toString(this.config.logFormat);
    
    switch (entry.level) {
      case LOG_LEVELS.TRACE:
      case LOG_LEVELS.DEBUG:
        console.debug(output);
        break;
      case LOG_LEVELS.INFO:
        console.info(output);
        break;
      case LOG_LEVELS.WARN:
        console.warn(output);
        break;
      case LOG_LEVELS.ERROR:
      case LOG_LEVELS.FATAL:
        console.error(output);
        break;
      default:
        console.log(output);
    }
  }

  /**
   * Output to file
   * @private
   * @param {LogEntry} entry - Log entry
   */
  _outputToFile(entry) {
    // File output implementation would go here
    // For now, just emit an event
    this.emit('fileOutput', entry);
  }
}

/**
 * Logger manager for multiple loggers
 */
export class LoggerManager {
  constructor(options = {}) {
    this.loggers = new Map();
    this.defaultConfig = { ...DEFAULT_CONFIG, ...options };
    this.enableLogging = options.enableLogging !== false;
  }

  /**
   * Get or create logger
   * @param {string} name - Logger name
   * @param {Object} config - Logger configuration
   * @returns {StructuredLogger} Logger instance
   */
  getLogger(name, config = {}) {
    if (!this.loggers.has(name)) {
      const loggerConfig = { ...this.defaultConfig, ...config };
      const logger = new StructuredLogger(loggerConfig);
      
      // Set up event listeners
      logger.on('log', (entry) => {
        if (this.enableLogging) {
          this.emit('log', { loggerName: name, entry });
        }
      });
      
      this.loggers.set(name, logger);
    }
    
    return this.loggers.get(name);
  }

  /**
   * Get all loggers
   * @returns {Object} All loggers
   */
  getAllLoggers() {
    const loggers = {};
    for (const [name, logger] of this.loggers) {
      loggers[name] = logger;
    }
    return loggers;
  }

  /**
   * Get metrics for all loggers
   * @returns {Object} Metrics for all loggers
   */
  getAllMetrics() {
    const metrics = {};
    for (const [name, logger] of this.loggers) {
      metrics[name] = logger.getMetrics();
    }
    return metrics;
  }

  /**
   * Set log level for all loggers
   * @param {number} level - Log level
   */
  setGlobalLevel(level) {
    for (const logger of this.loggers.values()) {
      logger.setLevel(level);
    }
  }

  /**
   * Remove logger
   * @param {string} name - Logger name
   */
  removeLogger(name) {
    this.loggers.delete(name);
  }

  /**
   * Clear all loggers
   */
  clear() {
    this.loggers.clear();
  }
}

/**
 * Create structured logger instance
 * @param {Object} options - Logger options
 * @returns {StructuredLogger} Logger instance
 */
export function createStructuredLogger(options = {}) {
  return new StructuredLogger(options);
}

/**
 * Create logger manager
 * @param {Object} options - Manager options
 * @returns {LoggerManager} Logger manager
 */
export function createLoggerManager(options = {}) {
  return new LoggerManager(options);
}

/**
 * Default logger instance
 */
export const defaultLogger = createStructuredLogger({
  level: LOG_LEVELS.INFO,
  enableConsole: true,
  enableTracing: true
});

/**
 * Convenience functions for default logger
 */
export const log = {
  trace: (message, context) => defaultLogger.trace(message, context),
  debug: (message, context) => defaultLogger.debug(message, context),
  info: (message, context) => defaultLogger.info(message, context),
  warn: (message, context) => defaultLogger.warn(message, context),
  error: (message, context) => defaultLogger.error(message, context),
  fatal: (message, context) => defaultLogger.fatal(message, context)
};

/**
 * Request tracing utilities
 */
export const tracing = {
  /**
   * Start request trace
   * @param {string} operation - Operation name
   * @param {Object} context - Trace context
   * @returns {string} Trace ID
   */
  start: (operation, context) => defaultLogger.startTrace(operation, context),
  
  /**
   * Complete request trace
   * @param {string} traceId - Trace ID
   * @param {string} status - Completion status
   * @param {Object} result - Result data
   */
  complete: (traceId, status, result) => defaultLogger.completeTrace(traceId, status, result),
  
  /**
   * Get active traces
   * @returns {Array} Active traces
   */
  getActive: () => defaultLogger.getActiveTraces(),
  
  /**
   * Get trace by ID
   * @param {string} traceId - Trace ID
   * @returns {TraceEntry|null} Trace entry
   */
  get: (traceId) => defaultLogger.getTrace(traceId)
};

/**
 * Context utilities
 */
export const context = {
  /**
   * Create correlation ID
   * @returns {string} Correlation ID
   */
  createCorrelationId: () => defaultLogger.createCorrelationId(),
  
  /**
   * Create request ID
   * @returns {string} Request ID
   */
  createRequestId: () => defaultLogger.createRequestId(),
  
  /**
   * Create log context
   * @param {Object} context - Base context
   * @returns {Object} Enhanced context
   */
  create: (context) => defaultLogger.createContext(context)
};

/**
 * Export log levels for external use
 */
// LOG_LEVELS is already exported above
