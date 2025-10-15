#!/usr/bin/env node

/**
 * Error Handling and Resilience Demo
 * 
 * Demonstrates the error handling and resilience patterns implemented in the runtime components.
 * Shows error handling, circuit breaker, retry policies, and structured logging in action.
 */

import { 
  ErrorHandler, 
  A2AError, 
  MCPError, 
  AuthError, 
  TimeoutError, 
  ValidationError,
  NetworkError,
  CircuitBreakerError,
  RetryError,
  handleError,
  ErrorMappers,
  ErrorContext
} from '../runtime/error-handler.js';

import { 
  CircuitBreaker, 
  CircuitBreakerManager, 
  CIRCUIT_STATES,
  createCircuitBreaker,
  createCircuitBreakerManager,
  withCircuitBreaker
} from '../runtime/circuit-breaker.js';

import { 
  RetryPolicy, 
  RetryPolicyManager, 
  RETRY_POLICIES,
  PREDEFINED_POLICIES,
  createRetryPolicy,
  createRetryPolicyManager,
  withRetryPolicy,
  RetryUtils
} from '../runtime/retry-policies.js';

import { 
  StructuredLogger, 
  LoggerManager, 
  LOG_LEVELS,
  createStructuredLogger,
  createLoggerManager,
  defaultLogger,
  log,
  tracing,
  context
} from '../runtime/structured-logger.js';

/**
 * Demo configuration
 */
const DEMO_CONFIG = {
  enableLogging: true,
  enableMetrics: true,
  enableTracing: true,
  logLevel: LOG_LEVELS.INFO
};

/**
 * Simulated external services
 */
class SimulatedExternalService {
  constructor(name, failureRate = 0.3, responseTime = 100) {
    this.name = name;
    this.failureRate = failureRate;
    this.responseTime = responseTime;
    this.callCount = 0;
  }

  async call() {
    this.callCount++;
    
    // Simulate response time
    await new Promise(resolve => setTimeout(resolve, this.responseTime));
    
    // Simulate failure based on failure rate
    if (Math.random() < this.failureRate) {
      const errorTypes = [
        new NetworkError(`${this.name} network error`),
        new TimeoutError(`${this.name} timeout`),
        new Error(`${this.name} generic error`)
      ];
      throw errorTypes[Math.floor(Math.random() * errorTypes.length)];
    }
    
    return { service: this.name, callCount: this.callCount, timestamp: new Date().toISOString() };
  }

  async authCall() {
    this.callCount++;
    await new Promise(resolve => setTimeout(resolve, this.responseTime));
    
    if (Math.random() < this.failureRate) {
      throw new AuthError(`${this.name} authentication failed`);
    }
    
    return { service: this.name, authenticated: true, timestamp: new Date().toISOString() };
  }

  async validationCall(data) {
    this.callCount++;
    await new Promise(resolve => setTimeout(resolve, this.responseTime));
    
    if (!data || !data.email) {
      throw new ValidationError('Invalid email address', null, 'email');
    }
    
    if (Math.random() < this.failureRate) {
      throw new ValidationError('Validation failed', null, 'data');
    }
    
    return { service: this.name, validated: true, data, timestamp: new Date().toISOString() };
  }
}

/**
 * Demo class
 */
class ErrorHandlingResilienceDemo {
  constructor() {
    this.logger = createStructuredLogger({
      level: DEMO_CONFIG.logLevel,
      enableConsole: true,
      enableMetrics: DEMO_CONFIG.enableMetrics,
      enableTracing: DEMO_CONFIG.enableTracing
    });
    
    this.errorHandler = new ErrorHandler({
      enableLogging: DEMO_CONFIG.enableLogging,
      enableMetrics: DEMO_CONFIG.enableMetrics
    });
    
    this.circuitBreakerManager = createCircuitBreakerManager({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 2000,
      enableLogging: DEMO_CONFIG.enableLogging,
      enableMetrics: DEMO_CONFIG.enableMetrics
    });
    
    this.retryPolicyManager = createRetryPolicyManager({
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2,
      jitter: true,
      policy: RETRY_POLICIES.EXPONENTIAL_BACKOFF,
      enableLogging: DEMO_CONFIG.enableLogging,
      enableMetrics: DEMO_CONFIG.enableMetrics
    });
    
    this.services = {
      api: new SimulatedExternalService('API', 0.4, 150),
      database: new SimulatedExternalService('Database', 0.2, 200),
      cache: new SimulatedExternalService('Cache', 0.1, 50),
      auth: new SimulatedExternalService('Auth', 0.3, 100),
      validation: new SimulatedExternalService('Validation', 0.2, 80)
    };
  }

  /**
   * Run the complete demo
   */
  async run() {
    console.log('🚀 Starting Error Handling and Resilience Demo\n');
    
    try {
      await this.demonstrateErrorHandling();
      await this.demonstrateCircuitBreaker();
      await this.demonstrateRetryPolicies();
      await this.demonstrateStructuredLogging();
      await this.demonstrateIntegration();
      await this.demonstrateTroubleshooting();
      
      console.log('\n✅ Demo completed successfully!');
    } catch (error) {
      console.error('\n❌ Demo failed:', error.message);
      throw error;
    }
  }

  /**
   * Demonstrate error handling
   */
  async demonstrateErrorHandling() {
    console.log('📋 1. Error Handling Demonstration');
    console.log('=====================================\n');
    
    const correlationId = context.createCorrelationId();
    const requestId = context.createRequestId();
    
    // Test different error types
    const errorTests = [
      {
        name: 'Network Error',
        error: new NetworkError('Connection failed', null, { endpoint: 'api.example.com' })
      },
      {
        name: 'Timeout Error',
        error: new TimeoutError('Request timed out', null, 5000, { operation: 'fetch' })
      },
      {
        name: 'Auth Error',
        error: new AuthError('Invalid token', null, { reason: 'expired' })
      },
      {
        name: 'Validation Error',
        error: new ValidationError('Invalid input', null, 'email', { value: 'invalid' })
      },
      {
        name: 'A2A Error',
        error: new A2AError('A2A request failed', null, { operation: 'request' })
      },
      {
        name: 'MCP Error',
        error: new MCPError('MCP operation failed', null, { operation: 'execute' })
      }
    ];
    
    for (const test of errorTests) {
      console.log(`Testing ${test.name}:`);
      
      const typedError = this.errorHandler.handleError(test.error, {
        correlationId,
        requestId,
        component: 'Demo',
        operation: 'error-handling-test'
      });
      
      console.log(`  - Error Type: ${typedError.constructor.name}`);
      console.log(`  - Message: ${typedError.message}`);
      console.log(`  - Retryable: ${this.errorHandler.isRetryable(typedError)}`);
      console.log(`  - Fatal: ${this.errorHandler.isFatal(typedError)}`);
      console.log(`  - Context: ${JSON.stringify(typedError.context, null, 2)}`);
      console.log('');
    }
    
    // Test error mapping
    console.log('Testing Error Mapping:');
    const httpError = ErrorMappers.fromHttpStatus(500, 'Internal Server Error', { endpoint: 'api' });
    console.log(`  - HTTP 500 mapped to: ${httpError.constructor.name}`);
    
    const mcpError = ErrorMappers.fromMCPError({ message: 'Invalid request', code: -32600 });
    console.log(`  - MCP error mapped to: ${mcpError.constructor.name}`);
    
    const fetchError = ErrorMappers.fromFetchError(new Error('fetch failed'), { url: 'https://api.example.com' });
    console.log(`  - Fetch error mapped to: ${fetchError.constructor.name}`);
    console.log('');
  }

  /**
   * Demonstrate circuit breaker
   */
  async demonstrateCircuitBreaker() {
    console.log('🔌 2. Circuit Breaker Demonstration');
    console.log('=====================================\n');
    
    const correlationId = context.createCorrelationId();
    
    // Test circuit breaker with failing service
    console.log('Testing Circuit Breaker with Failing Service:');
    
    try {
      // Make multiple calls to trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          const result = await this.circuitBreakerManager.execute('failing-service', async () => {
            return await this.services.api.call();
          });
          console.log(`  Call ${i + 1}: Success - ${result.service}`);
        } catch (error) {
          if (error instanceof CircuitBreakerError) {
            console.log(`  Call ${i + 1}: Circuit breaker open - ${error.message}`);
          } else {
            console.log(`  Call ${i + 1}: Service failed - ${error.message}`);
          }
        }
        
        // Small delay between calls
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
    
    // Check circuit breaker status
    const status = this.circuitBreakerManager.getAllStatus();
    console.log('\nCircuit Breaker Status:');
    console.log(`  - State: ${status['failing-service']?.state}`);
    console.log(`  - Failure Count: ${status['failing-service']?.failureCount}`);
    console.log(`  - Can Execute: ${status['failing-service']?.canExecute}`);
    console.log(`  - Metrics: ${JSON.stringify(status['failing-service']?.metrics, null, 2)}`);
    
    // Test circuit breaker recovery
    console.log('\nTesting Circuit Breaker Recovery:');
    
    // Wait for timeout
    console.log('  Waiting for circuit breaker timeout...');
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    // Try to call service again (should transition to half-open)
    try {
      const result = await this.circuitBreakerManager.execute('failing-service', async () => {
        return await this.services.api.call();
      });
      console.log(`  Recovery call: Success - ${result.service}`);
    } catch (error) {
      console.log(`  Recovery call: Failed - ${error.message}`);
    }
    
    console.log('');
  }

  /**
   * Demonstrate retry policies
   */
  async demonstrateRetryPolicies() {
    console.log('🔄 3. Retry Policies Demonstration');
    console.log('===================================\n');
    
    const correlationId = context.createCorrelationId();
    
    // Test different retry policies
    const policies = [
      { name: 'FAST', config: PREDEFINED_POLICIES.FAST },
      { name: 'STANDARD', config: PREDEFINED_POLICIES.STANDARD },
      { name: 'SLOW', config: PREDEFINED_POLICIES.SLOW },
      { name: 'IMMEDIATE', config: PREDEFINED_POLICIES.IMMEDIATE }
    ];
    
    for (const policy of policies) {
      console.log(`Testing ${policy.name} Retry Policy:`);
      
      const startTime = Date.now();
      
      try {
        const result = await this.retryPolicyManager.execute(policy.name, async () => {
          return await this.services.database.call();
        });
        
        const duration = Date.now() - startTime;
        console.log(`  - Success after ${duration}ms: ${result.service}`);
      } catch (error) {
        const duration = Date.now() - startTime;
        if (error instanceof RetryError) {
          console.log(`  - Failed after ${duration}ms: ${error.message}`);
          console.log(`  - Attempts: ${error.context.attempts}`);
        } else {
          console.log(`  - Failed after ${duration}ms: ${error.message}`);
        }
      }
      
      // Small delay between policies
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Test retry policy with non-retryable error
    console.log('\nTesting Non-Retryable Error:');
    
    try {
      const result = await this.retryPolicyManager.execute('auth-policy', async () => {
        return await this.services.auth.authCall();
      });
      console.log(`  - Success: ${result.service}`);
    } catch (error) {
      if (error instanceof AuthError) {
        console.log(`  - Auth error (not retried): ${error.message}`);
      } else {
        console.log(`  - Other error: ${error.message}`);
      }
    }
    
    // Test retry policy with validation error
    console.log('\nTesting Validation Error:');
    
    try {
      const result = await this.retryPolicyManager.execute('validation-policy', async () => {
        return await this.services.validation.validationCall({ email: 'invalid' });
      });
      console.log(`  - Success: ${result.service}`);
    } catch (error) {
      if (error instanceof ValidationError) {
        console.log(`  - Validation error (not retried): ${error.message}`);
      } else {
        console.log(`  - Other error: ${error.message}`);
      }
    }
    
    console.log('');
  }

  /**
   * Demonstrate structured logging
   */
  async demonstrateStructuredLogging() {
    console.log('📝 4. Structured Logging Demonstration');
    console.log('======================================\n');
    
    const correlationId = context.createCorrelationId();
    const requestId = context.createRequestId();
    
    // Test different log levels
    console.log('Testing Log Levels:');
    
    this.logger.trace('Trace message', { correlationId, requestId, component: 'Demo' });
    this.logger.debug('Debug message', { correlationId, requestId, component: 'Demo' });
    this.logger.info('Info message', { correlationId, requestId, component: 'Demo' });
    this.logger.warn('Warn message', { correlationId, requestId, component: 'Demo' });
    this.logger.error('Error message', { correlationId, requestId, component: 'Demo' });
    this.logger.fatal('Fatal message', { correlationId, requestId, component: 'Demo' });
    
    // Test request tracing
    console.log('\nTesting Request Tracing:');
    
    const traceId = this.logger.startTrace('demo-operation', {
      correlationId,
      requestId,
      component: 'Demo',
      operation: 'structured-logging-test'
    });
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 100));
    
    this.logger.completeTrace(traceId, 'completed', { 
      result: 'success',
      duration: 100,
      metadata: { test: true }
    });
    
    // Test active traces
    const activeTraces = this.logger.getActiveTraces();
    console.log(`  - Active traces: ${activeTraces.length}`);
    
    // Test logger metrics
    const metrics = this.logger.getMetrics();
    console.log(`  - Total logs: ${metrics.totalLogs}`);
    console.log(`  - Total traces: ${metrics.totalTraces}`);
    console.log(`  - Completed traces: ${metrics.completedTraces}`);
    
    console.log('');
  }

  /**
   * Demonstrate integration
   */
  async demonstrateIntegration() {
    console.log('🔗 5. Integration Demonstration');
    console.log('================================\n');
    
    const correlationId = context.createCorrelationId();
    const requestId = context.createRequestId();
    
    // Simulate a complex operation with all resilience patterns
    console.log('Testing Integrated Resilience Patterns:');
    
    const traceId = this.logger.startTrace('integrated-operation', {
      correlationId,
      requestId,
      component: 'Demo',
      operation: 'integration-test'
    });
    
    try {
      // Step 1: Authentication with retry
      console.log('  Step 1: Authentication...');
      const authResult = await this.retryPolicyManager.execute('auth-policy', async () => {
        return await this.services.auth.authCall();
      });
      this.logger.info('Authentication successful', { 
        correlationId, 
        requestId, 
        component: 'Demo',
        operation: 'auth',
        result: authResult
      });
      
      // Step 2: Data validation with retry
      console.log('  Step 2: Data validation...');
      const validationResult = await this.retryPolicyManager.execute('validation-policy', async () => {
        return await this.services.validation.validationCall({ email: 'test@example.com' });
      });
      this.logger.info('Validation successful', { 
        correlationId, 
        requestId, 
        component: 'Demo',
        operation: 'validation',
        result: validationResult
      });
      
      // Step 3: API call with circuit breaker
      console.log('  Step 3: API call...');
      const apiResult = await this.circuitBreakerManager.execute('api-service', async () => {
        return await this.services.api.call();
      });
      this.logger.info('API call successful', { 
        correlationId, 
        requestId, 
        component: 'Demo',
        operation: 'api-call',
        result: apiResult
      });
      
      // Step 4: Database operation with circuit breaker
      console.log('  Step 4: Database operation...');
      const dbResult = await this.circuitBreakerManager.execute('database-service', async () => {
        return await this.services.database.call();
      });
      this.logger.info('Database operation successful', { 
        correlationId, 
        requestId, 
        component: 'Demo',
        operation: 'database',
        result: dbResult
      });
      
      this.logger.completeTrace(traceId, 'completed', { 
        result: 'success',
        steps: ['auth', 'validation', 'api-call', 'database'],
        duration: Date.now() - traceId
      });
      
      console.log('  ✅ Integrated operation completed successfully');
      
    } catch (error) {
      const typedError = this.errorHandler.handleError(error, {
        correlationId,
        requestId,
        component: 'Demo',
        operation: 'integration-test'
      });
      
      this.logger.error('Integrated operation failed', { 
        correlationId, 
        requestId, 
        component: 'Demo',
        operation: 'integration-test',
        error: typedError.message,
        errorType: typedError.constructor.name,
        retryable: this.errorHandler.isRetryable(typedError),
        fatal: this.errorHandler.isFatal(typedError)
      });
      
      this.logger.completeTrace(traceId, 'failed', { 
        error: typedError.message,
        errorType: typedError.constructor.name
      });
      
      console.log(`  ❌ Integrated operation failed: ${typedError.message}`);
    }
    
    console.log('');
  }

  /**
   * Demonstrate troubleshooting
   */
  async demonstrateTroubleshooting() {
    console.log('🔧 6. Troubleshooting Demonstration');
    console.log('====================================\n');
    
    // Show error handler stats
    console.log('Error Handler Statistics:');
    const errorStats = this.errorHandler.getStats();
    console.log(`  - Total errors: ${errorStats.totalErrors}`);
    console.log(`  - Error types: ${JSON.stringify(errorStats.errorTypes, null, 2)}`);
    console.log(`  - History size: ${errorStats.historySize}`);
    
    // Show circuit breaker status
    console.log('\nCircuit Breaker Status:');
    const circuitBreakerStatus = this.circuitBreakerManager.getAllStatus();
    for (const [serviceName, status] of Object.entries(circuitBreakerStatus)) {
      console.log(`  - ${serviceName}:`);
      console.log(`    State: ${status.state}`);
      console.log(`    Failure count: ${status.failureCount}`);
      console.log(`    Can execute: ${status.canExecute}`);
      console.log(`    Failure rate: ${status.metrics.failureRate.toFixed(2)}`);
    }
    
    // Show retry policy status
    console.log('\nRetry Policy Status:');
    const retryPolicyStatus = this.retryPolicyManager.getAllStatus();
    for (const [policyName, status] of Object.entries(retryPolicyStatus)) {
      console.log(`  - ${policyName}:`);
      console.log(`    Total attempts: ${status.metrics.totalAttempts}`);
      console.log(`    Success rate: ${status.metrics.successRate.toFixed(2)}`);
      console.log(`    Average retry time: ${status.metrics.averageRetryTime.toFixed(2)}ms`);
    }
    
    // Show logger metrics
    console.log('\nLogger Metrics:');
    const loggerMetrics = this.logger.getMetrics();
    console.log(`  - Total logs: ${loggerMetrics.totalLogs}`);
    console.log(`  - Logs by level: ${JSON.stringify(loggerMetrics.logsByLevel, null, 2)}`);
    console.log(`  - Total traces: ${loggerMetrics.totalTraces}`);
    console.log(`  - Completed traces: ${loggerMetrics.completedTraces}`);
    console.log(`  - Average trace duration: ${loggerMetrics.averageTraceDuration.toFixed(2)}ms`);
    
    console.log('');
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    const demo = new ErrorHandlingResilienceDemo();
    await demo.run();
  } catch (error) {
    console.error('Demo failed:', error);
    process.exit(1);
  }
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { ErrorHandlingResilienceDemo };
