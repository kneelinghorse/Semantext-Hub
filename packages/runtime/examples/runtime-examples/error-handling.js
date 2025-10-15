#!/usr/bin/env node

/**
 * Error Handling Example
 * 
 * This example demonstrates comprehensive error handling including:
 * - Centralized error handling
 * - Error classification and typing
 * - Circuit breaker error handling
 * - Retry policy error handling
 * - Structured error logging
 */

import { ErrorHandler, handleError, ErrorMappers, ErrorContext } from '../../runtime/error-handler.js';
import { createCircuitBreaker, CIRCUIT_STATES } from '../../runtime/circuit-breaker.js';
import { createRetryPolicy, RETRY_POLICIES } from '../../runtime/retry-policies.js';
import { createStructuredLogger, LOG_LEVELS } from '../../runtime/structured-logger.js';

async function errorHandlingExample() {
  console.log('=== Error Handling Example ===\n');
  
  // Initialize error handling components
  console.log('1. Initializing error handling components...');
  const errorHandler = new ErrorHandler({
    enableLogging: true,
    enableMetrics: true
  });
  
  const circuitBreaker = createCircuitBreaker({
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    enableLogging: true,
    enableMetrics: true
  });
  
  const retryPolicy = createRetryPolicy({
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
    policy: RETRY_POLICIES.EXPONENTIAL_BACKOFF,
    enableLogging: true,
    enableMetrics: true
  });
  
  const logger = createStructuredLogger({
    level: LOG_LEVELS.INFO,
    enableConsole: true,
    enableTracing: true
  });
  
  console.log('✓ Error handling components initialized\n');
  
  // Centralized error handling
  console.log('2. Centralized error handling...');
  try {
    // Simulate an operation that might fail
    await simulateOperation('test-operation');
  } catch (error) {
    const typedError = errorHandler.handleError(error, {
      operation: 'test-operation',
      component: 'ErrorHandlingExample',
      requestId: 'req-123',
      correlationId: 'corr-456'
    });
    
    console.log('✓ Error handled centrally:');
    console.log(`  Error type: ${typedError.constructor.name}`);
    console.log(`  Error message: ${typedError.message}`);
    console.log(`  Is retryable: ${errorHandler.isRetryable(typedError)}`);
    console.log(`  Is fatal: ${errorHandler.isFatal(typedError)}`);
    
    if (typedError.context) {
      console.log(`  Error context: ${JSON.stringify(typedError.context, null, 2)}`);
    }
  }
  console.log('');
  
  // Error classification
  console.log('3. Error classification...');
  const errorTypes = [
    new Error('Network connection failed'),
    new Error('Authentication failed'),
    new Error('Validation error'),
    new Error('Timeout error'),
    new Error('Unknown error')
  ];
  
  errorTypes.forEach((error, index) => {
    const typedError = errorHandler.handleError(error, {
      operation: `classification-test-${index}`
    });
    
    console.log(`✓ Error ${index + 1} classification:`);
    console.log(`  Original: ${error.message}`);
    console.log(`  Classified: ${typedError.constructor.name}`);
    console.log(`  Retryable: ${errorHandler.isRetryable(typedError)}`);
    console.log(`  Fatal: ${errorHandler.isFatal(typedError)}`);
  });
  console.log('');
  
  // Circuit breaker error handling
  console.log('4. Circuit breaker error handling...');
  console.log('✓ Simulating circuit breaker failures...');
  
  // Simulate failures to open circuit breaker
  for (let i = 0; i < 5; i++) {
    try {
      await circuitBreaker.execute(async () => {
        throw new Error(`Simulated failure ${i + 1}`);
      });
    } catch (error) {
      console.log(`  Failure ${i + 1}: ${error.message}`);
    }
  }
  
  const circuitStatus = circuitBreaker.getStatus();
  console.log('✓ Circuit breaker status:');
  console.log(`  State: ${circuitStatus.state}`);
  console.log(`  Can execute: ${circuitStatus.canExecute}`);
  console.log(`  Failure count: ${circuitStatus.failureCount}`);
  console.log(`  Success count: ${circuitStatus.successCount}`);
  console.log('');
  
  // Retry policy error handling
  console.log('5. Retry policy error handling...');
  console.log('✓ Simulating retry policy...');
  
  let attemptCount = 0;
  try {
    await retryPolicy.execute(async () => {
      attemptCount++;
      console.log(`  Attempt ${attemptCount}`);
      
      if (attemptCount < 3) {
        throw new Error(`Simulated retry failure ${attemptCount}`);
      }
      
      return 'success';
    });
    
    console.log('✓ Retry policy succeeded after retries');
  } catch (error) {
    console.log('⚠ Retry policy exhausted all retries:', error.message);
  }
  
  const retryStatus = retryPolicy.getStatus();
  console.log('✓ Retry policy status:');
  console.log(`  Max retries: ${retryStatus.config.maxRetries}`);
  console.log(`  Base delay: ${retryStatus.config.baseDelay}ms`);
  console.log(`  Max delay: ${retryStatus.config.maxDelay}ms`);
  console.log(`  Backoff multiplier: ${retryStatus.config.backoffMultiplier}`);
  console.log('');
  
  // Error mapping
  console.log('6. Error mapping...');
  
  // Map HTTP status to error
  const httpError = ErrorMappers.fromHttpStatus(500, 'Internal Server Error', {
    endpoint: '/api/test',
    method: 'POST'
  });
  console.log('✓ HTTP error mapped:');
  console.log(`  Type: ${httpError.constructor.name}`);
  console.log(`  Message: ${httpError.message}`);
  console.log(`  Status: ${httpError.status}`);
  
  // Map MCP error to typed error
  const mcpError = ErrorMappers.fromMCPError({
    message: 'Invalid request',
    code: -32600
  }, {
    toolName: 'read_file',
    operation: 'execute'
  });
  console.log('✓ MCP error mapped:');
  console.log(`  Type: ${mcpError.constructor.name}`);
  console.log(`  Message: ${mcpError.message}`);
  console.log(`  Code: ${mcpError.code}`);
  
  // Map fetch error to typed error
  const fetchError = ErrorMappers.fromFetchError(new Error('Network error'), {
    url: 'https://api.example.com/test'
  });
  console.log('✓ Fetch error mapped:');
  console.log(`  Type: ${fetchError.constructor.name}`);
  console.log(`  Message: ${fetchError.message}`);
  console.log('');
  
  // Error context creation
  console.log('7. Error context creation...');
  
  const requestContext = ErrorContext.createRequestContext('req-123', 'POST', '/api/test');
  console.log('✓ Request context created:');
  console.log(`  Request ID: ${requestContext.requestId}`);
  console.log(`  Method: ${requestContext.method}`);
  console.log(`  Path: ${requestContext.path}`);
  
  const operationContext = ErrorContext.createOperationContext('register', 'Registry');
  console.log('✓ Operation context created:');
  console.log(`  Operation: ${operationContext.operation}`);
  console.log(`  Component: ${operationContext.component}`);
  
  const agentContext = ErrorContext.createAgentContext('urn:agent:ai:ml-agent@1.0.0', 'execute');
  console.log('✓ Agent context created:');
  console.log(`  Agent URN: ${agentContext.agentUrn}`);
  console.log(`  Action: ${agentContext.action}`);
  console.log('');
  
  // Structured error logging
  console.log('8. Structured error logging...');
  
  const correlationId = logger.createCorrelationId();
  const requestId = logger.createRequestId();
  
  // Log error with context
  logger.error('Operation failed', {
    correlationId,
    requestId,
    component: 'ErrorHandlingExample',
    operation: 'test-operation',
    error: 'Simulated error for logging demonstration',
    errorType: 'TestError',
    metadata: {
      userId: 'user-123',
      sessionId: 'session-456'
    }
  });
  
  console.log('✓ Error logged with structured context');
  console.log(`  Correlation ID: ${correlationId}`);
  console.log(`  Request ID: ${requestId}`);
  console.log('');
  
  // Request tracing
  console.log('9. Request tracing...');
  
  const traceId = logger.startTrace('error-handling-operation', {
    correlationId,
    requestId,
    component: 'ErrorHandlingExample'
  });
  
  try {
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 100));
    
    logger.completeTrace(traceId, 'completed', {
      result: 'success',
      duration: 100
    });
    
    console.log('✓ Trace completed successfully');
  } catch (error) {
    logger.completeTrace(traceId, 'failed', {
      error: error.message,
      duration: 100
    });
    
    console.log('✓ Trace completed with error');
  }
  console.log('');
  
  // Performance metrics
  console.log('10. Performance metrics...');
  
  const circuitBreakerMetrics = circuitBreaker.metrics.getSummary();
  console.log('✓ Circuit breaker metrics:');
  console.log(`  Total requests: ${circuitBreakerMetrics.totalRequests}`);
  console.log(`  Success rate: ${circuitBreakerMetrics.successRate}`);
  console.log(`  Failure rate: ${circuitBreakerMetrics.failureRate}`);
  console.log(`  Circuit opens: ${circuitBreakerMetrics.circuitOpens}`);
  
  const retryPolicyMetrics = retryPolicy.metrics.getSummary();
  console.log('✓ Retry policy metrics:');
  console.log(`  Total attempts: ${retryPolicyMetrics.totalAttempts}`);
  console.log(`  Successful attempts: ${retryPolicyMetrics.successfulAttempts}`);
  console.log(`  Failed attempts: ${retryPolicyMetrics.failedAttempts}`);
  console.log(`  Average retry time: ${retryPolicyMetrics.averageRetryTime}ms`);
  console.log('');
  
  // Active traces
  console.log('11. Active traces...');
  const activeTraces = logger.getActiveTraces();
  console.log(`✓ Active traces: ${activeTraces.length}`);
  activeTraces.forEach((trace, index) => {
    console.log(`  Trace ${index + 1}: ${trace.name} (${trace.status})`);
  });
  console.log('');
  
  console.log('=== Example completed successfully ===');
}

// Simulate an operation that might fail
async function simulateOperation(operationName) {
  // Randomly succeed or fail
  if (Math.random() > 0.5) {
    throw new Error(`Simulated failure in ${operationName}`);
  }
  
  return `Success in ${operationName}`;
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  errorHandlingExample().catch(error => {
    console.error('Example failed:', error);
    process.exit(1);
  });
}

export { errorHandlingExample };
