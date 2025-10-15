#!/usr/bin/env node

/**
 * A2A Communication Example
 * 
 * This example demonstrates agent-to-agent communication including:
 * - Basic A2A requests
 * - Authentication and delegation
 * - Error handling and retry logic
 * - Circuit breaker protection
 */

import { createA2AClient } from '../../runtime/a2a-client.js';

// Mock authentication provider
class MockAuthProvider {
  constructor() {
    this.tokens = new Map();
  }
  
  async getToken() {
    return 'mock-bearer-token-123';
  }
  
  async validateToken(token) {
    return token === 'mock-bearer-token-123';
  }
}

async function a2aCommunicationExample() {
  console.log('=== A2A Communication Example ===\n');
  
  // Initialize A2A client
  console.log('1. Initializing A2A client...');
  const authProvider = new MockAuthProvider();
  
  const a2aClient = createA2AClient({
    authProvider,
    baseUrl: 'http://localhost:3000',
    enableLogging: true,
    timeout: 10000,
    maxRetries: 3,
    circuitBreakerThreshold: 5,
    circuitBreakerSuccessThreshold: 3,
    circuitBreakerTimeout: 60000
  });
  console.log('✓ A2A client initialized\n');
  
  // Basic A2A request
  console.log('2. Making basic A2A request...');
  try {
    const response = await a2aClient.request(
      'urn:agent:ai:ml-agent@1.0.0',
      '/api/inference',
      {
        method: 'POST',
        body: {
          input: 'test data',
          model: 'gpt-3.5-turbo'
        },
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✓ A2A request successful');
    console.log(`  Status: ${response.status}`);
    console.log(`  Response: ${JSON.stringify(response.data, null, 2)}`);
  } catch (error) {
    console.log('⚠ A2A request failed (expected in demo):', error.message);
  }
  console.log('');
  
  // A2A request with authentication
  console.log('3. Making authenticated A2A request...');
  try {
    const response = await a2aClient.request(
      'urn:agent:ai:ml-agent@1.0.0',
      '/api/secure-inference',
      {
        method: 'POST',
        body: {
          input: 'sensitive data',
          model: 'gpt-4'
        },
        context: {
          delegationUrn: 'urn:agent:user:delegator@1.0.0'
        }
      }
    );
    
    console.log('✓ Authenticated A2A request successful');
    console.log(`  Status: ${response.status}`);
    console.log(`  Response: ${JSON.stringify(response.data, null, 2)}`);
  } catch (error) {
    console.log('⚠ Authenticated A2A request failed (expected in demo):', error.message);
  }
  console.log('');
  
  // A2A request with different methods
  console.log('4. Making A2A requests with different HTTP methods...');
  
  // GET request
  try {
    const getResponse = await a2aClient.request(
      'urn:agent:ai:ml-agent@1.0.0',
      '/api/health',
      {
        method: 'GET',
        timeout: 5000
      }
    );
    console.log('✓ GET request successful');
    console.log(`  Status: ${getResponse.status}`);
  } catch (error) {
    console.log('⚠ GET request failed (expected in demo):', error.message);
  }
  
  // PUT request
  try {
    const putResponse = await a2aClient.request(
      'urn:agent:ai:ml-agent@1.0.0',
      '/api/models/update',
      {
        method: 'PUT',
        body: {
          modelId: 'model-123',
          config: { temperature: 0.7 }
        }
      }
    );
    console.log('✓ PUT request successful');
    console.log(`  Status: ${putResponse.status}`);
  } catch (error) {
    console.log('⚠ PUT request failed (expected in demo):', error.message);
  }
  
  // DELETE request
  try {
    const deleteResponse = await a2aClient.request(
      'urn:agent:ai:ml-agent@1.0.0',
      '/api/models/model-123',
      {
        method: 'DELETE'
      }
    );
    console.log('✓ DELETE request successful');
    console.log(`  Status: ${deleteResponse.status}`);
  } catch (error) {
    console.log('⚠ DELETE request failed (expected in demo):', error.message);
  }
  console.log('');
  
  // Circuit breaker status
  console.log('5. Checking circuit breaker status...');
  const circuitBreakerStatus = a2aClient.circuitBreaker.getStatus();
  console.log('✓ Circuit breaker status:');
  console.log(`  State: ${circuitBreakerStatus.state}`);
  console.log(`  Can execute: ${circuitBreakerStatus.canExecute}`);
  console.log(`  Failure count: ${circuitBreakerStatus.failureCount}`);
  console.log(`  Success count: ${circuitBreakerStatus.successCount}`);
  console.log('');
  
  // Retry policy status
  console.log('6. Checking retry policy status...');
  const retryPolicyStatus = a2aClient.retryPolicy.getStatus();
  console.log('✓ Retry policy status:');
  console.log(`  Max retries: ${retryPolicyStatus.config.maxRetries}`);
  console.log(`  Base delay: ${retryPolicyStatus.config.baseDelay}ms`);
  console.log(`  Max delay: ${retryPolicyStatus.config.maxDelay}ms`);
  console.log(`  Backoff multiplier: ${retryPolicyStatus.config.backoffMultiplier}`);
  console.log('');
  
  // Error handling demonstration
  console.log('7. Demonstrating error handling...');
  try {
    // This will fail and demonstrate error handling
    await a2aClient.request(
      'urn:agent:invalid:agent@1.0.0',
      '/api/nonexistent',
      {
        method: 'POST',
        body: { test: 'data' }
      }
    );
  } catch (error) {
    console.log('✓ Error handling demonstration:');
    console.log(`  Error type: ${error.constructor.name}`);
    console.log(`  Error message: ${error.message}`);
    if (error.context) {
      console.log(`  Error context: ${JSON.stringify(error.context, null, 2)}`);
    }
  }
  console.log('');
  
  // Performance metrics
  console.log('8. Performance metrics...');
  const circuitBreakerMetrics = a2aClient.circuitBreaker.metrics.getSummary();
  console.log('✓ Circuit breaker metrics:');
  console.log(`  Total requests: ${circuitBreakerMetrics.totalRequests}`);
  console.log(`  Success rate: ${circuitBreakerMetrics.successRate}`);
  console.log(`  Failure rate: ${circuitBreakerMetrics.failureRate}`);
  console.log(`  Circuit opens: ${circuitBreakerMetrics.circuitOpens}`);
  console.log('');
  
  const retryPolicyMetrics = a2aClient.retryPolicy.metrics.getSummary();
  console.log('✓ Retry policy metrics:');
  console.log(`  Total attempts: ${retryPolicyMetrics.totalAttempts}`);
  console.log(`  Successful attempts: ${retryPolicyMetrics.successfulAttempts}`);
  console.log(`  Failed attempts: ${retryPolicyMetrics.failedAttempts}`);
  console.log(`  Average retry time: ${retryPolicyMetrics.averageRetryTime}ms`);
  console.log('');
  
  // Batch requests demonstration
  console.log('9. Batch requests demonstration...');
  const batchRequests = [
    {
      agentUrn: 'urn:agent:ai:ml-agent@1.0.0',
      route: '/api/inference',
      options: {
        method: 'POST',
        body: { input: 'batch test 1' }
      }
    },
    {
      agentUrn: 'urn:agent:data:etl-agent@1.0.0',
      route: '/api/process',
      options: {
        method: 'POST',
        body: { data: 'batch test 2' }
      }
    },
    {
      agentUrn: 'urn:agent:api:gateway-agent@1.0.0',
      route: '/api/route',
      options: {
        method: 'POST',
        body: { request: 'batch test 3' }
      }
    }
  ];
  
  console.log('✓ Making batch requests...');
  const batchResults = await Promise.allSettled(
    batchRequests.map(req => 
      a2aClient.request(req.agentUrn, req.route, req.options)
    )
  );
  
  batchResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      console.log(`  ✓ Request ${index + 1} successful: ${result.value.status}`);
    } else {
      console.log(`  ⚠ Request ${index + 1} failed: ${result.reason.message}`);
    }
  });
  console.log('');
  
  console.log('=== Example completed successfully ===');
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  a2aCommunicationExample().catch(error => {
    console.error('Example failed:', error);
    process.exit(1);
  });
}

export { a2aCommunicationExample };
