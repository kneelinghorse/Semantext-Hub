#!/usr/bin/env node

/**
 * Logging Example
 * 
 * This example demonstrates comprehensive logging including:
 * - Structured logging with correlation IDs
 * - Request tracing
 * - Performance metrics
 * - Log levels and filtering
 * - Console and file output
 * - Error logging with context
 */

import { createStructuredLogger, LOG_LEVELS } from '../../runtime/structured-logger.js';

async function loggingExample() {
  console.log('=== Logging Example ===\n');
  
  // Initialize structured logger
  console.log('1. Initializing structured logger...');
  const logger = createStructuredLogger({
    level: LOG_LEVELS.INFO,
    enableConsole: true,
    enableFile: true,
    enableTracing: true,
    enableMetrics: true,
    filePath: './runtime-examples.log'
  });
  
  console.log('✓ Structured logger initialized\n');
  
  // Basic logging
  console.log('2. Basic logging...');
  
  logger.debug('Debug message - only visible if level is DEBUG');
  logger.info('Info message - visible at INFO level and above');
  logger.warn('Warning message - visible at WARN level and above');
  logger.error('Error message - visible at ERROR level and above');
  
  console.log('✓ Basic logging completed\n');
  
  // Structured logging with context
  console.log('3. Structured logging with context...');
  
  const correlationId = logger.createCorrelationId();
  const requestId = logger.createRequestId();
  
  logger.info('User authentication started', {
    correlationId,
    requestId,
    component: 'AuthService',
    operation: 'authenticate',
    userId: 'user-123',
    sessionId: 'session-456',
    metadata: {
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0...'
    }
  });
  
  logger.info('User authentication completed', {
    correlationId,
    requestId,
    component: 'AuthService',
    operation: 'authenticate',
    userId: 'user-123',
    sessionId: 'session-456',
    result: 'success',
    duration: 150,
    metadata: {
      authMethod: 'oauth2',
      provider: 'google'
    }
  });
  
  console.log('✓ Structured logging completed');
  console.log(`  Correlation ID: ${correlationId}`);
  console.log(`  Request ID: ${requestId}\n`);
  
  // Request tracing
  console.log('4. Request tracing...');
  
  const traceId = logger.startTrace('api-request', {
    correlationId,
    requestId,
    component: 'APIService',
    endpoint: '/api/users',
    method: 'GET'
  });
  
  try {
    // Simulate API processing
    await new Promise(resolve => setTimeout(resolve, 200));
    
    logger.addTraceEvent(traceId, 'database-query', {
      query: 'SELECT * FROM users WHERE id = ?',
      duration: 50
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    logger.addTraceEvent(traceId, 'response-serialization', {
      format: 'json',
      size: 1024
    });
    
    logger.completeTrace(traceId, 'completed', {
      statusCode: 200,
      duration: 350,
      result: 'success'
    });
    
    console.log('✓ Request trace completed successfully');
  } catch (error) {
    logger.completeTrace(traceId, 'failed', {
      error: error.message,
      duration: 350,
      result: 'error'
    });
    
    console.log('✓ Request trace completed with error');
  }
  console.log('');
  
  // Error logging with context
  console.log('5. Error logging with context...');
  
  try {
    // Simulate an error
    throw new Error('Database connection failed');
  } catch (error) {
    logger.error('Database operation failed', {
      correlationId,
      requestId,
      component: 'DatabaseService',
      operation: 'connect',
      error: error.message,
      errorType: error.constructor.name,
      stack: error.stack,
      metadata: {
        database: 'postgresql',
        host: 'localhost',
        port: 5432,
        retryCount: 3
      }
    });
    
    console.log('✓ Error logged with full context');
  }
  console.log('');
  
  // Performance metrics
  console.log('6. Performance metrics...');
  
  // Start a performance measurement
  const perfId = logger.startPerformanceMeasurement('database-operation', {
    correlationId,
    requestId,
    component: 'DatabaseService',
    operation: 'query'
  });
  
  // Simulate database operation
  await new Promise(resolve => setTimeout(resolve, 300));
  
  logger.endPerformanceMeasurement(perfId, {
    result: 'success',
    recordsProcessed: 1000,
    metadata: {
      queryType: 'SELECT',
      tableName: 'users'
    }
  });
  
  console.log('✓ Performance measurement completed');
  console.log('');
  
  // Log levels demonstration
  console.log('7. Log levels demonstration...');
  
  console.log('✓ Current log level: INFO');
  console.log('✓ Messages at different levels:');
  
  logger.debug('This debug message will not be shown (level too low)');
  logger.info('This info message will be shown');
  logger.warn('This warning message will be shown');
  logger.error('This error message will be shown');
  
  // Change log level to DEBUG
  logger.setLevel(LOG_LEVELS.DEBUG);
  console.log('✓ Log level changed to DEBUG');
  
  logger.debug('This debug message will now be shown');
  logger.info('This info message will still be shown');
  
  // Reset to INFO
  logger.setLevel(LOG_LEVELS.INFO);
  console.log('✓ Log level reset to INFO');
  console.log('');
  
  // Batch logging
  console.log('8. Batch logging...');
  
  const batchId = logger.startBatch('user-import', {
    correlationId,
    requestId,
    component: 'ImportService',
    operation: 'import-users',
    totalRecords: 1000
  });
  
  // Simulate batch processing
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 50));
    
    logger.addBatchEvent(batchId, 'record-processed', {
      recordId: `user-${i}`,
      status: 'success',
      metadata: {
        email: `user${i}@example.com`,
        name: `User ${i}`
      }
    });
  }
  
  logger.completeBatch(batchId, 'completed', {
    processedRecords: 10,
    failedRecords: 0,
    duration: 500
  });
  
  console.log('✓ Batch logging completed');
  console.log('');
  
  // Health check logging
  console.log('9. Health check logging...');
  
  const healthCheckId = logger.startHealthCheck('database', {
    correlationId,
    requestId,
    component: 'HealthService',
    operation: 'check-database'
  });
  
  try {
    // Simulate health check
    await new Promise(resolve => setTimeout(resolve, 100));
    
    logger.completeHealthCheck(healthCheckId, 'healthy', {
      responseTime: 100,
      metadata: {
        version: '13.4',
        connections: 5,
        maxConnections: 100
      }
    });
    
    console.log('✓ Health check completed successfully');
  } catch (error) {
    logger.completeHealthCheck(healthCheckId, 'unhealthy', {
      error: error.message,
      responseTime: 100,
      metadata: {
        version: '13.4',
        connections: 0,
        maxConnections: 100
      }
    });
    
    console.log('✓ Health check completed with error');
  }
  console.log('');
  
  // Metrics summary
  console.log('10. Metrics summary...');
  
  const metrics = logger.metrics.getSummary();
  console.log('✓ Logging metrics:');
  console.log(`  Total log entries: ${metrics.totalEntries}`);
  console.log(`  Debug entries: ${metrics.debugEntries}`);
  console.log(`  Info entries: ${metrics.infoEntries}`);
  console.log(`  Warning entries: ${metrics.warningEntries}`);
  console.log(`  Error entries: ${metrics.errorEntries}`);
  console.log(`  Active traces: ${metrics.activeTraces}`);
  console.log(`  Completed traces: ${metrics.completedTraces}`);
  console.log(`  Performance measurements: ${metrics.performanceMeasurements}`);
  console.log(`  Batch operations: ${metrics.batchOperations}`);
  console.log(`  Health checks: ${metrics.healthChecks}`);
  console.log('');
  
  // Active traces
  console.log('11. Active traces...');
  const activeTraces = logger.getActiveTraces();
  console.log(`✓ Active traces: ${activeTraces.length}`);
  activeTraces.forEach((trace, index) => {
    console.log(`  Trace ${index + 1}: ${trace.name} (${trace.status})`);
    console.log(`    Started: ${new Date(trace.startedAt).toISOString()}`);
    console.log(`    Events: ${trace.events.length}`);
  });
  console.log('');
  
  // Log file information
  console.log('12. Log file information...');
  console.log('✓ Log file created: ./runtime-examples.log');
  console.log('✓ Check the file for detailed structured logs');
  console.log('');
  
  console.log('=== Example completed successfully ===');
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  loggingExample().catch(error => {
    console.error('Example failed:', error);
    process.exit(1);
  });
}

export { loggingExample };
