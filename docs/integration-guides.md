# OSSP-AGI Integration Guides

Step-by-step guides for integrating OSSP-AGI into your applications and workflows.

## Table of Contents

- [Quick Start Integration](#quick-start-integration)
- [Microservices Integration](#microservices-integration)
- [API Discovery Integration](#api-discovery-integration)
- [Event-Driven Integration](#event-driven-integration)
- [Agent Integration](#agent-integration)
- [Workflow Integration](#workflow-integration)
- [Runtime Integration](#runtime-integration)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

---

## Quick Start Integration

### Prerequisites

- Node.js 18 or higher
- Git (optional but recommended)
- Basic familiarity with command line

### Step 1: Install OSSP-AGI

```bash
# Install globally
npm install -g @ossp-agi/cli

# Or install locally in your project
npm install @ossp-agi/cli --save-dev
```

### Step 2: Initialize Project

```bash
# Interactive setup
ossp quickstart

# Or non-interactive setup
ossp quickstart --template microservices --name my-project
```

### Step 3: Validate Setup

```bash
cd my-project
npm install
npm run validate
```

### Step 4: Generate Governance

```bash
npm run governance
```

### Step 5: Explore Examples

```bash
# List available protocols
ls artifacts/

# View a protocol
cat artifacts/service-a-protocol.json

# Check workflow
cat workflows/microservices-integration.yaml
```

---

## Microservices Integration

### Overview

This guide shows how to integrate OSSP-AGI into a microservices architecture with cross-service validation and governance.

### Step 1: Discover Service APIs

```bash
# Discover APIs from multiple services
ossp discover api https://api.user-service.com/openapi.json --output ./artifacts/user-service
ossp discover api https://api.order-service.com/openapi.json --output ./artifacts/order-service
ossp discover api https://api.payment-service.com/openapi.json --output ./artifacts/payment-service
```

### Step 2: Validate Cross-Service Dependencies

```bash
# Validate entire ecosystem
ossp validate --ecosystem --manifests ./artifacts

# Validate with detailed output
ossp validate --ecosystem --verbose --manifests ./artifacts
```

### Step 3: Generate Governance Documentation

```bash
# Generate comprehensive governance
ossp governance --manifests ./artifacts --output ./GOVERNANCE.md

# Generate specific sections
ossp governance --manifests ./artifacts --sections security,metrics,compliance
```

### Step 4: Create Workflow Definition

Create `workflows/microservices-integration.yaml`:

```yaml
apiVersion: workflow.v1
kind: Workflow
metadata:
  name: microservices-integration
  description: Cross-service integration workflow
  version: "1.0.0"

spec:
  inputs:
    userId:
      type: string
      description: User ID for the operation
      required: true
    items:
      type: array
      description: Order items
      required: true

  steps:
    validate-user:
      type: api
      endpoint: "urn:proto:api:user-service@1.0.0#/users/{userId}"
      method: GET
      args:
        userId: "{{ inputs.userId }}"
      outputs:
        user: "{{ result.user }}"
      onError: fail

    create-order:
      type: api
      endpoint: "urn:proto:api:order-service@1.0.0#/orders"
      method: POST
      args:
        userId: "{{ inputs.userId }}"
        items: "{{ inputs.items }}"
      outputs:
        order: "{{ result.order }}"
      onError: fail

    process-payment:
      type: api
      endpoint: "urn:proto:api:payment-service@1.0.0#/payments"
      method: POST
      args:
        orderId: "{{ steps.create-order.outputs.order.id }}"
        amount: "{{ steps.create-order.outputs.order.total }}"
      outputs:
        payment: "{{ result.payment }}"
      onError: rollback-order

  outputs:
    order:
      type: object
      value: "{{ steps.create-order.outputs.order }}"
    payment:
      type: object
      value: "{{ steps.process-payment.outputs.payment }}"
```

### Step 5: Validate and Simulate Workflow

```bash
# Validate workflow
ossp workflow validate ./workflows/microservices-integration.yaml

# Simulate workflow execution
ossp workflow simulate ./workflows/microservices-integration.yaml --inputs ./test-inputs.json
```

### Step 6: Implement Service Integration

Create `src/services/microservices-integration.js`:

```javascript
import { createAgentDiscoveryService } from '@ossp-agi/runtime';
import { createA2AClient } from '@ossp-agi/runtime';
import { createMCPClient } from '@ossp-agi/runtime';

class MicroservicesIntegration {
  constructor(config) {
    this.config = config;
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
  }

  async initialize() {
    // Initialize discovery service
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true,
      cacheTtl: 300000
    });
    await this.discovery.initialize();

    // Initialize A2A client
    this.a2aClient = createA2AClient({
      baseUrl: this.config.a2aBaseUrl,
      enableLogging: true,
      timeout: 10000,
      maxRetries: 3
    });

    // Initialize MCP client
    this.mcpClient = createMCPClient({
      endpoint: this.config.mcpEndpoint,
      enableLogging: true,
      timeout: 15000
    });

    console.log('Microservices integration initialized');
  }

  async discoverServices() {
    const services = await this.discovery.discoverAgents({
      domain: 'microservices',
      capabilities: ['api-service']
    });

    return services.agents;
  }

  async executeWorkflow(workflowName, inputs) {
    // Load workflow definition
    const workflow = await this.loadWorkflow(workflowName);

    // Execute workflow steps
    const results = {};
    for (const step of workflow.spec.steps) {
      try {
        const result = await this.executeStep(step, inputs, results);
        results[step.id] = result;
      } catch (error) {
        console.error(`Step ${step.id} failed:`, error);
        throw error;
      }
    }

    return results;
  }

  async executeStep(step, inputs, previousResults) {
    switch (step.type) {
      case 'api':
        return await this.executeAPIStep(step, inputs, previousResults);
      case 'agent':
        return await this.executeAgentStep(step, inputs, previousResults);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  async executeAPIStep(step, inputs, previousResults) {
    const endpoint = step.endpoint;
    const method = step.method || 'GET';
    const args = this.resolveTemplate(step.args, inputs, previousResults);

    // Extract service URN from endpoint
    const serviceUrn = endpoint.split('#')[0];
    
    // Make API call via A2A client
    const response = await this.a2aClient.request(serviceUrn, step.endpoint, {
      method,
      body: method !== 'GET' ? args : undefined,
      params: method === 'GET' ? args : undefined
    });

    return response.data;
  }

  async executeAgentStep(step, inputs, previousResults) {
    const agentUrn = step.agent;
    const tool = step.tool;
    const args = this.resolveTemplate(step.args, inputs, previousResults);

    // Execute tool via MCP client
    await this.mcpClient.open();
    try {
      const result = await this.mcpClient.executeTool(tool, args);
      return result;
    } finally {
      await this.mcpClient.close();
    }
  }

  resolveTemplate(template, inputs, previousResults) {
    // Simple template resolution
    let resolved = JSON.stringify(template);
    
    // Replace input references
    Object.keys(inputs).forEach(key => {
      resolved = resolved.replace(new RegExp(`{{ inputs.${key} }}`, 'g'), JSON.stringify(inputs[key]));
    });

    // Replace step output references
    Object.keys(previousResults).forEach(stepId => {
      Object.keys(previousResults[stepId]).forEach(outputKey => {
        resolved = resolved.replace(
          new RegExp(`{{ steps.${stepId}.outputs.${outputKey} }}`, 'g'),
          JSON.stringify(previousResults[stepId][outputKey])
        );
      });
    });

    return JSON.parse(resolved);
  }

  async loadWorkflow(workflowName) {
    // Load workflow from file system
    const fs = await import('fs/promises');
    const workflowPath = `./workflows/${workflowName}.yaml`;
    const workflowContent = await fs.readFile(workflowPath, 'utf-8');
    
    // Parse YAML (you'll need a YAML parser)
    const yaml = await import('yaml');
    return yaml.parse(workflowContent);
  }

  async shutdown() {
    if (this.mcpClient && this.mcpClient.isConnected()) {
      await this.mcpClient.close();
    }
    if (this.discovery) {
      await this.discovery.shutdown();
    }
  }
}

export default MicroservicesIntegration;
```

### Step 7: Create Integration Tests

Create `tests/microservices-integration.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import MicroservicesIntegration from '../src/services/microservices-integration.js';

describe('Microservices Integration', () => {
  let integration;

  beforeAll(async () => {
    integration = new MicroservicesIntegration({
      a2aBaseUrl: 'http://localhost:3000',
      mcpEndpoint: 'npx @modelcontextprotocol/server-filesystem'
    });
    await integration.initialize();
  });

  afterAll(async () => {
    await integration.shutdown();
  });

  it('should discover services', async () => {
    const services = await integration.discoverServices();
    expect(services).toBeDefined();
    expect(Array.isArray(services)).toBe(true);
  });

  it('should execute workflow', async () => {
    const inputs = {
      userId: 'user-123',
      items: [
        { productId: 'prod-1', quantity: 2 },
        { productId: 'prod-2', quantity: 1 }
      ]
    };

    const results = await integration.executeWorkflow('microservices-integration', inputs);
    expect(results).toBeDefined();
    expect(results['validate-user']).toBeDefined();
    expect(results['create-order']).toBeDefined();
    expect(results['process-payment']).toBeDefined();
  });
});
```

---

## API Discovery Integration

### Overview

This guide shows how to integrate OSSP-AGI's API discovery capabilities into your development workflow.

### Step 1: Set Up API Discovery

```bash
# Create discovery configuration
mkdir -p config/discovery
cat > config/discovery/api-sources.json << EOF
{
  "sources": [
    {
      "name": "user-service",
      "url": "https://api.user-service.com/openapi.json",
      "type": "openapi",
      "enabled": true
    },
    {
      "name": "order-service", 
      "url": "https://api.order-service.com/openapi.json",
      "type": "openapi",
      "enabled": true
    },
    {
      "name": "payment-service",
      "url": "https://api.payment-service.com/openapi.json",
      "type": "openapi",
      "enabled": true
    }
  ]
}
EOF
```

### Step 2: Create Discovery Script

Create `scripts/discover-apis.js`:

```javascript
#!/usr/bin/env node

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const configPath = './config/discovery/api-sources.json';
const outputDir = './artifacts/discovered';

async function discoverAPIs() {
  console.log('🔍 Starting API discovery...');

  // Load configuration
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  
  // Create output directory
  execSync(`mkdir -p ${outputDir}`);

  // Discover each API
  for (const source of config.sources) {
    if (!source.enabled) {
      console.log(`⏭️  Skipping disabled source: ${source.name}`);
      continue;
    }

    console.log(`📡 Discovering ${source.name}...`);
    
    try {
      const command = `ossp discover api "${source.url}" --output "${join(outputDir, source.name)}" --validate`;
      execSync(command, { stdio: 'inherit' });
      console.log(`✅ Successfully discovered ${source.name}`);
    } catch (error) {
      console.error(`❌ Failed to discover ${source.name}:`, error.message);
    }
  }

  // Validate ecosystem
  console.log('🔍 Validating ecosystem...');
  try {
    execSync(`ossp validate --ecosystem --manifests "${outputDir}"`, { stdio: 'inherit' });
    console.log('✅ Ecosystem validation passed');
  } catch (error) {
    console.error('❌ Ecosystem validation failed:', error.message);
    process.exit(1);
  }

  // Generate governance
  console.log('📋 Generating governance documentation...');
  try {
    execSync(`ossp governance --manifests "${outputDir}" --output "./GOVERNANCE.md"`, { stdio: 'inherit' });
    console.log('✅ Governance documentation generated');
  } catch (error) {
    console.error('❌ Failed to generate governance:', error.message);
  }

  console.log('🎉 API discovery completed successfully!');
}

discoverAPIs().catch(error => {
  console.error('💥 Discovery failed:', error);
  process.exit(1);
});
```

### Step 3: Create API Client Generator

Create `scripts/generate-api-clients.js`:

```javascript
#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { readdirSync } from 'fs';
import { join } from 'path';

const artifactsDir = './artifacts/discovered';
const outputDir = './src/clients';

function generateAPIClient(protocolFile) {
  const protocol = JSON.parse(readFileSync(protocolFile, 'utf-8'));
  const serviceName = protocol.api.id;
  const className = `${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)}Client`;

  let clientCode = `// Auto-generated API client for ${serviceName}
// Generated from: ${protocolFile}

export class ${className} {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl;
    this.options = {
      timeout: 10000,
      retries: 3,
      ...options
    };
  }

  async request(method, path, data = null) {
    const url = new URL(path, this.baseUrl);
    
    const requestOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...this.options.headers
      },
      timeout: this.options.timeout
    };

    if (data && method !== 'GET') {
      requestOptions.body = JSON.stringify(data);
    }

    let lastError;
    for (let attempt = 0; attempt <= this.options.retries; attempt++) {
      try {
        const response = await fetch(url.toString(), requestOptions);
        
        if (!response.ok) {
          throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
        }

        return await response.json();
      } catch (error) {
        lastError = error;
        if (attempt < this.options.retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
      }
    }

    throw lastError;
  }

`;

  // Generate methods for each endpoint
  protocol.endpoints.forEach(endpoint => {
    const methodName = endpoint.path.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '');
    const httpMethod = endpoint.method.toLowerCase();
    
    clientCode += `
  async ${methodName}(${httpMethod === 'get' ? 'params = {}' : 'data, params = {}'}) {
    const path = '${endpoint.path}';
    ${httpMethod === 'get' ? `
    const url = new URL(path, this.baseUrl);
    Object.keys(params).forEach(key => {
      url.searchParams.set(key, params[key]);
    });
    return await this.request('GET', url.pathname + url.search);
    ` : `
    return await this.request('${endpoint.method.toUpperCase()}', path, data);
    `}
  }

`;
  });

  clientCode += `}

export default ${className};
`;

  return clientCode;
}

function generateAPIClients() {
  console.log('🔧 Generating API clients...');

  // Create output directory
  execSync(`mkdir -p ${outputDir}`);

  // Read all protocol files
  const protocolFiles = readdirSync(artifactsDir)
    .filter(file => file.endsWith('.json'))
    .map(file => join(artifactsDir, file));

  // Generate client for each protocol
  protocolFiles.forEach(protocolFile => {
    try {
      const clientCode = generateAPIClient(protocolFile);
      const protocol = JSON.parse(readFileSync(protocolFile, 'utf-8'));
      const serviceName = protocol.api.id;
      const outputFile = join(outputDir, `${serviceName}-client.js`);
      
      writeFileSync(outputFile, clientCode);
      console.log(`✅ Generated client: ${outputFile}`);
    } catch (error) {
      console.error(`❌ Failed to generate client for ${protocolFile}:`, error.message);
    }
  });

  // Generate index file
  const indexCode = protocolFiles.map(protocolFile => {
    const protocol = JSON.parse(readFileSync(protocolFile, 'utf-8'));
    const serviceName = protocol.api.id;
    const className = `${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)}Client`;
    return `export { ${className} } from './${serviceName}-client.js';`;
  }).join('\n');

  writeFileSync(join(outputDir, 'index.js'), indexCode);
  console.log('✅ Generated index file');

  console.log('🎉 API client generation completed!');
}

generateAPIClients();
```

### Step 4: Create Discovery Workflow

Create `.github/workflows/api-discovery.yml`:

```yaml
name: API Discovery

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

jobs:
  discover:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Discover APIs
        run: node scripts/discover-apis.js
        
      - name: Generate API clients
        run: node scripts/generate-api-clients.js
        
      - name: Validate changes
        run: |
          if [ -n "$(git status --porcelain)" ]; then
            echo "API changes detected"
            git add .
            git commit -m "Update discovered APIs [skip ci]"
            git push
          else
            echo "No API changes detected"
          fi
```

### Step 5: Create API Integration Service

Create `src/services/api-integration.js`:

```javascript
import { UserServiceClient } from '../clients/user-service-client.js';
import { OrderServiceClient } from '../clients/order-service-client.js';
import { PaymentServiceClient } from '../clients/payment-service-client.js';

class APIIntegrationService {
  constructor(config) {
    this.config = config;
    this.clients = {
      userService: new UserServiceClient(config.userServiceUrl),
      orderService: new OrderServiceClient(config.orderServiceUrl),
      paymentService: new PaymentServiceClient(config.paymentServiceUrl)
    };
  }

  async validateUser(userId) {
    try {
      const user = await this.clients.userService.getUser({ userId });
      return { valid: true, user };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  async createOrder(userId, items) {
    try {
      const order = await this.clients.orderService.createOrder({
        userId,
        items
      });
      return { success: true, order };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async processPayment(orderId, amount, method) {
    try {
      const payment = await this.clients.paymentService.processPayment({
        orderId,
        amount,
        method
      });
      return { success: true, payment };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async executeOrderWorkflow(userId, items) {
    // Step 1: Validate user
    const userValidation = await this.validateUser(userId);
    if (!userValidation.valid) {
      throw new Error(`User validation failed: ${userValidation.error}`);
    }

    // Step 2: Create order
    const orderCreation = await this.createOrder(userId, items);
    if (!orderCreation.success) {
      throw new Error(`Order creation failed: ${orderCreation.error}`);
    }

    // Step 3: Process payment
    const paymentProcessing = await this.processPayment(
      orderCreation.order.id,
      orderCreation.order.total,
      'credit_card'
    );
    if (!paymentProcessing.success) {
      throw new Error(`Payment processing failed: ${paymentProcessing.error}`);
    }

    return {
      user: userValidation.user,
      order: orderCreation.order,
      payment: paymentProcessing.payment
    };
  }
}

export default APIIntegrationService;
```

---

## Event-Driven Integration

### Overview

This guide shows how to integrate OSSP-AGI's event discovery and consumer generation capabilities.

### Step 1: Discover Event Protocols

```bash
# Discover events from AsyncAPI specs
ossp discover event https://api.example.com/asyncapi.json --output ./artifacts/events --detect-patterns

# Discover from local file
ossp discover event ./event-spec.yaml --output ./artifacts/events --detect-patterns
```

### Step 2: Generate Event Consumers

```bash
# Generate Kafka consumer
ossp generate consumer kafka --protocol ./artifacts/events/order-events.json --output ./src/consumers

# Generate AMQP consumer
ossp generate consumer amqp --protocol ./artifacts/events/payment-events.json --output ./src/consumers

# Generate MQTT consumer
ossp generate consumer mqtt --protocol ./artifacts/events/iot-events.json --output ./src/consumers
```

### Step 3: Create Event Integration Service

Create `src/services/event-integration.js`:

```javascript
import { KafkaConsumer } from '../consumers/kafka-consumer.js';
import { AMQPConsumer } from '../consumers/amqp-consumer.js';
import { MQTTConsumer } from '../consumers/mqtt-consumer.js';

class EventIntegrationService {
  constructor(config) {
    this.config = config;
    this.consumers = {
      kafka: new KafkaConsumer(config.kafka),
      amqp: new AMQPConsumer(config.amqp),
      mqtt: new MQTTConsumer(config.mqtt)
    };
    this.handlers = new Map();
  }

  async initialize() {
    // Initialize all consumers
    await Promise.all([
      this.consumers.kafka.initialize(),
      this.consumers.amqp.initialize(),
      this.consumers.mqtt.initialize()
    ]);

    console.log('Event integration service initialized');
  }

  registerHandler(eventType, handler) {
    this.handlers.set(eventType, handler);
  }

  async startConsuming() {
    // Start consuming from all brokers
    await Promise.all([
      this.startKafkaConsumption(),
      this.startAMQPConsumption(),
      this.startMQTTConsumption()
    ]);
  }

  async startKafkaConsumption() {
    await this.consumers.kafka.subscribe(['order-events', 'payment-events'], async (message) => {
      try {
        const eventType = message.headers['event-type'];
        const handler = this.handlers.get(eventType);
        
        if (handler) {
          await handler(message);
        } else {
          console.warn(`No handler registered for event type: ${eventType}`);
        }
      } catch (error) {
        console.error('Error processing Kafka message:', error);
      }
    });
  }

  async startAMQPConsumption() {
    await this.consumers.amqp.subscribe(['order.queue', 'payment.queue'], async (message) => {
      try {
        const eventType = message.properties.type;
        const handler = this.handlers.get(eventType);
        
        if (handler) {
          await handler(message);
        } else {
          console.warn(`No handler registered for event type: ${eventType}`);
        }
      } catch (error) {
        console.error('Error processing AMQP message:', error);
      }
    });
  }

  async startMQTTConsumption() {
    await this.consumers.mqtt.subscribe(['iot/sensors', 'iot/devices'], async (message) => {
      try {
        const eventType = message.topic.split('/').pop();
        const handler = this.handlers.get(eventType);
        
        if (handler) {
          await handler(message);
        } else {
          console.warn(`No handler registered for event type: ${eventType}`);
        }
      } catch (error) {
        console.error('Error processing MQTT message:', error);
      }
    });
  }

  async shutdown() {
    await Promise.all([
      this.consumers.kafka.disconnect(),
      this.consumers.amqp.disconnect(),
      this.consumers.mqtt.disconnect()
    ]);
  }
}

export default EventIntegrationService;
```

### Step 4: Create Event Handlers

Create `src/handlers/order-handlers.js`:

```javascript
export class OrderHandlers {
  constructor(orderService, notificationService) {
    this.orderService = orderService;
    this.notificationService = notificationService;
  }

  async handleOrderCreated(event) {
    console.log('Processing order created event:', event.data);
    
    try {
      // Update order status
      await this.orderService.updateOrderStatus(event.data.orderId, 'processing');
      
      // Send notification
      await this.notificationService.sendOrderConfirmation(event.data.userId, event.data.orderId);
      
      console.log('Order created event processed successfully');
    } catch (error) {
      console.error('Error processing order created event:', error);
      throw error;
    }
  }

  async handleOrderCancelled(event) {
    console.log('Processing order cancelled event:', event.data);
    
    try {
      // Update order status
      await this.orderService.updateOrderStatus(event.data.orderId, 'cancelled');
      
      // Process refund if payment was made
      if (event.data.paymentId) {
        await this.orderService.processRefund(event.data.paymentId);
      }
      
      // Send notification
      await this.notificationService.sendOrderCancellation(event.data.userId, event.data.orderId);
      
      console.log('Order cancelled event processed successfully');
    } catch (error) {
      console.error('Error processing order cancelled event:', error);
      throw error;
    }
  }

  async handlePaymentProcessed(event) {
    console.log('Processing payment processed event:', event.data);
    
    try {
      // Update order status
      await this.orderService.updateOrderStatus(event.data.orderId, 'paid');
      
      // Send notification
      await this.notificationService.sendPaymentConfirmation(event.data.userId, event.data.orderId);
      
      console.log('Payment processed event processed successfully');
    } catch (error) {
      console.error('Error processing payment processed event:', error);
      throw error;
    }
  }
}
```

### Step 5: Create Event Integration App

Create `src/apps/event-integration-app.js`:

```javascript
import EventIntegrationService from '../services/event-integration.js';
import { OrderHandlers } from '../handlers/order-handlers.js';
import OrderService from '../services/order-service.js';
import NotificationService from '../services/notification-service.js';

class EventIntegrationApp {
  constructor(config) {
    this.config = config;
    this.eventService = new EventIntegrationService(config.event);
    this.orderService = new OrderService(config.order);
    this.notificationService = new NotificationService(config.notification);
    this.orderHandlers = new OrderHandlers(this.orderService, this.notificationService);
  }

  async initialize() {
    // Initialize services
    await this.orderService.initialize();
    await this.notificationService.initialize();
    await this.eventService.initialize();

    // Register event handlers
    this.eventService.registerHandler('order.created', (event) => 
      this.orderHandlers.handleOrderCreated(event)
    );
    this.eventService.registerHandler('order.cancelled', (event) => 
      this.orderHandlers.handleOrderCancelled(event)
    );
    this.eventService.registerHandler('payment.processed', (event) => 
      this.orderHandlers.handlePaymentProcessed(event)
    );

    console.log('Event integration app initialized');
  }

  async start() {
    await this.eventService.startConsuming();
    console.log('Event consumption started');
  }

  async shutdown() {
    await this.eventService.shutdown();
    await this.orderService.shutdown();
    await this.notificationService.shutdown();
    console.log('Event integration app shutdown');
  }
}

// Start the app
const app = new EventIntegrationApp({
  event: {
    kafka: {
      brokers: ['localhost:9092'],
      groupId: 'order-processor'
    },
    amqp: {
      url: 'amqp://localhost:5672',
      exchange: 'order-events'
    },
    mqtt: {
      url: 'mqtt://localhost:1883',
      clientId: 'order-processor'
    }
  },
  order: {
    databaseUrl: 'postgresql://localhost:5432/orders'
  },
  notification: {
    emailService: 'smtp://localhost:587',
    smsService: 'twilio://account:token@api.twilio.com'
  }
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await app.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await app.shutdown();
  process.exit(0);
});

// Start the application
app.initialize()
  .then(() => app.start())
  .catch(error => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
```

---

## Agent Integration

### Overview

This guide shows how to integrate OSSP-AGI's agent discovery and communication capabilities.

### Step 1: Discover Agents

```bash
# Discover agents from registry
ossp discover agents --domain ai --capabilities ml-inference

# Discover agents from local registry
ossp discover agents --registry ./local-registry --domain automation
```

### Step 2: Create Agent Integration Service

Create `src/services/agent-integration.js`:

```javascript
import { createAgentDiscoveryService } from '@ossp-agi/runtime';
import { createA2AClient } from '@ossp-agi/runtime';
import { createMCPClient } from '@ossp-agi/runtime';

class AgentIntegrationService {
  constructor(config) {
    this.config = config;
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
    this.agents = new Map();
  }

  async initialize() {
    // Initialize discovery service
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true,
      cacheTtl: 300000
    });
    await this.discovery.initialize();

    // Initialize A2A client
    this.a2aClient = createA2AClient({
      baseUrl: this.config.a2aBaseUrl,
      enableLogging: true,
      timeout: 10000,
      maxRetries: 3
    });

    // Initialize MCP client
    this.mcpClient = createMCPClient({
      endpoint: this.config.mcpEndpoint,
      enableLogging: true,
      timeout: 15000
    });

    console.log('Agent integration service initialized');
  }

  async discoverAgents(query) {
    const result = await this.discovery.discoverAgents(query);
    
    // Cache discovered agents
    result.agents.forEach(agent => {
      this.agents.set(agent.urn, agent);
    });

    return result;
  }

  async getAgent(urn) {
    // Check cache first
    if (this.agents.has(urn)) {
      return this.agents.get(urn);
    }

    // Discover from registry
    const agent = await this.discovery.getAgent(urn);
    if (agent) {
      this.agents.set(urn, agent);
    }

    return agent;
  }

  async communicateWithAgent(agentUrn, route, data) {
    try {
      const response = await this.a2aClient.request(agentUrn, route, {
        method: 'POST',
        body: data
      });

      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async executeAgentTool(agentUrn, toolName, input) {
    try {
      await this.mcpClient.open();
      const result = await this.mcpClient.executeTool(toolName, input);
      await this.mcpClient.close();

      return {
        success: true,
        result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getAgentCapabilities(agentUrn) {
    const agent = await this.getAgent(agentUrn);
    if (!agent) {
      throw new Error(`Agent not found: ${agentUrn}`);
    }

    return agent.capabilities;
  }

  async listAgentTools(agentUrn) {
    const capabilities = await this.getAgentCapabilities(agentUrn);
    return capabilities.tools || [];
  }

  async shutdown() {
    if (this.mcpClient && this.mcpClient.isConnected()) {
      await this.mcpClient.close();
    }
    if (this.discovery) {
      await this.discovery.shutdown();
    }
  }
}

export default AgentIntegrationService;
```

### Step 3: Create Agent Workflow Service

Create `src/services/agent-workflow-service.js`:

```javascript
import AgentIntegrationService from './agent-integration.js';

class AgentWorkflowService {
  constructor(config) {
    this.agentService = new AgentIntegrationService(config);
    this.workflows = new Map();
  }

  async initialize() {
    await this.agentService.initialize();
    console.log('Agent workflow service initialized');
  }

  async registerWorkflow(name, workflow) {
    this.workflows.set(name, workflow);
    console.log(`Registered workflow: ${name}`);
  }

  async executeWorkflow(workflowName, inputs) {
    const workflow = this.workflows.get(workflowName);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowName}`);
    }

    console.log(`Executing workflow: ${workflowName}`);
    const results = {};

    for (const step of workflow.steps) {
      try {
        console.log(`Executing step: ${step.id}`);
        const result = await this.executeStep(step, inputs, results);
        results[step.id] = result;
        console.log(`Step ${step.id} completed successfully`);
      } catch (error) {
        console.error(`Step ${step.id} failed:`, error);
        throw error;
      }
    }

    return results;
  }

  async executeStep(step, inputs, previousResults) {
    switch (step.type) {
      case 'agent':
        return await this.executeAgentStep(step, inputs, previousResults);
      case 'tool':
        return await this.executeToolStep(step, inputs, previousResults);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  async executeAgentStep(step, inputs, previousResults) {
    const agentUrn = step.agent;
    const route = step.route;
    const args = this.resolveTemplate(step.args, inputs, previousResults);

    const response = await this.agentService.communicateWithAgent(agentUrn, route, args);
    
    if (!response.success) {
      throw new Error(`Agent communication failed: ${response.error}`);
    }

    return response.data;
  }

  async executeToolStep(step, inputs, previousResults) {
    const agentUrn = step.agent;
    const toolName = step.tool;
    const args = this.resolveTemplate(step.args, inputs, previousResults);

    const response = await this.agentService.executeAgentTool(agentUrn, toolName, args);
    
    if (!response.success) {
      throw new Error(`Tool execution failed: ${response.error}`);
    }

    return response.result;
  }

  resolveTemplate(template, inputs, previousResults) {
    let resolved = JSON.stringify(template);
    
    // Replace input references
    Object.keys(inputs).forEach(key => {
      resolved = resolved.replace(new RegExp(`{{ inputs.${key} }}`, 'g'), JSON.stringify(inputs[key]));
    });

    // Replace step output references
    Object.keys(previousResults).forEach(stepId => {
      Object.keys(previousResults[stepId]).forEach(outputKey => {
        resolved = resolved.replace(
          new RegExp(`{{ steps.${stepId}.outputs.${outputKey} }}`, 'g'),
          JSON.stringify(previousResults[stepId][outputKey])
        );
      });
    });

    return JSON.parse(resolved);
  }

  async shutdown() {
    await this.agentService.shutdown();
  }
}

export default AgentWorkflowService;
```

### Step 4: Create Agent Integration App

Create `src/apps/agent-integration-app.js`:

```javascript
import AgentWorkflowService from '../services/agent-workflow-service.js';

class AgentIntegrationApp {
  constructor(config) {
    this.config = config;
    this.workflowService = new AgentWorkflowService(config);
  }

  async initialize() {
    await this.workflowService.initialize();

    // Register workflows
    await this.registerWorkflows();

    console.log('Agent integration app initialized');
  }

  async registerWorkflows() {
    // Data processing workflow
    await this.workflowService.registerWorkflow('data-processing', {
      name: 'Data Processing Workflow',
      description: 'Process data using AI agents',
      steps: [
        {
          id: 'validate-data',
          type: 'agent',
          agent: 'urn:agent:ai:data-validator@1.0.0',
          route: '/api/validate',
          args: {
            data: '{{ inputs.data }}'
          }
        },
        {
          id: 'process-data',
          type: 'agent',
          agent: 'urn:agent:ai:data-processor@1.0.0',
          route: '/api/process',
          args: {
            data: '{{ steps.validate-data.outputs.validatedData }}'
          }
        },
        {
          id: 'generate-report',
          type: 'tool',
          agent: 'urn:agent:ai:report-generator@1.0.0',
          tool: 'generate_report',
          args: {
            processedData: '{{ steps.process-data.outputs.processedData }}'
          }
        }
      ]
    });

    // Content generation workflow
    await this.workflowService.registerWorkflow('content-generation', {
      name: 'Content Generation Workflow',
      description: 'Generate content using AI agents',
      steps: [
        {
          id: 'analyze-requirements',
          type: 'agent',
          agent: 'urn:agent:ai:content-analyzer@1.0.0',
          route: '/api/analyze',
          args: {
            requirements: '{{ inputs.requirements }}'
          }
        },
        {
          id: 'generate-content',
          type: 'agent',
          agent: 'urn:agent:ai:content-generator@1.0.0',
          route: '/api/generate',
          args: {
            analysis: '{{ steps.analyze-requirements.outputs.analysis }}'
          }
        },
        {
          id: 'review-content',
          type: 'agent',
          agent: 'urn:agent:ai:content-reviewer@1.0.0',
          route: '/api/review',
          args: {
            content: '{{ steps.generate-content.outputs.content }}'
          }
        }
      ]
    });
  }

  async executeDataProcessing(data) {
    return await this.workflowService.executeWorkflow('data-processing', { data });
  }

  async executeContentGeneration(requirements) {
    return await this.workflowService.executeWorkflow('content-generation', { requirements });
  }

  async shutdown() {
    await this.workflowService.shutdown();
  }
}

// Start the app
const app = new AgentIntegrationApp({
  a2aBaseUrl: 'http://localhost:3000',
  mcpEndpoint: 'npx @modelcontextprotocol/server-filesystem'
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await app.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await app.shutdown();
  process.exit(0);
});

// Start the application
app.initialize()
  .then(() => {
    console.log('Agent integration app started');
    
    // Example usage
    app.executeDataProcessing({ input: 'test data' })
      .then(result => console.log('Data processing result:', result))
      .catch(error => console.error('Data processing error:', error));
  })
  .catch(error => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
```

---

## Workflow Integration

### Overview

This guide shows how to integrate OSSP-AGI's workflow validation and execution capabilities.

### Step 1: Create Workflow Definitions

Create `workflows/data-pipeline.yaml`:

```yaml
apiVersion: workflow.v1
kind: Workflow
metadata:
  name: data-pipeline
  description: Data processing pipeline workflow
  version: "1.0.0"

spec:
  inputs:
    dataSource:
      type: string
      description: Data source identifier
      required: true
    processingOptions:
      type: object
      description: Processing configuration options
      required: false

  steps:
    extract-data:
      type: api
      endpoint: "urn:proto:api:data-service@1.0.0#/extract"
      method: POST
      args:
        source: "{{ inputs.dataSource }}"
        options: "{{ inputs.processingOptions }}"
      outputs:
        rawData: "{{ result.data }}"
      onError: fail

    validate-data:
      type: api
      endpoint: "urn:proto:api:validation-service@1.0.0#/validate"
      method: POST
      args:
        data: "{{ steps.extract-data.outputs.rawData }}"
      outputs:
        validatedData: "{{ result.data }}"
      onError: fail

    transform-data:
      type: api
      endpoint: "urn:proto:api:transform-service@1.0.0#/transform"
      method: POST
      args:
        data: "{{ steps.validate-data.outputs.validatedData }}"
        options: "{{ inputs.processingOptions }}"
      outputs:
        transformedData: "{{ result.data }}"
      onError: fail

    load-data:
      type: api
      endpoint: "urn:proto:api:storage-service@1.0.0#/load"
      method: POST
      args:
        data: "{{ steps.transform-data.outputs.transformedData }}"
      outputs:
        loadedData: "{{ result.data }}"
      onError: rollback-transform

  outputs:
    processedData:
      type: object
      value: "{{ steps.load-data.outputs.loadedData }}"
    summary:
      type: object
      value: "{{ steps.transform-data.outputs.summary }}"
```

### Step 2: Create Workflow Integration Service

Create `src/services/workflow-integration.js`:

```javascript
import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'yaml';

class WorkflowIntegrationService {
  constructor(config) {
    this.config = config;
    this.workflows = new Map();
    this.executors = new Map();
  }

  async initialize() {
    // Load workflow definitions
    await this.loadWorkflows();
    
    // Initialize executors
    await this.initializeExecutors();

    console.log('Workflow integration service initialized');
  }

  async loadWorkflows() {
    const workflowDir = './workflows';
    const fs = await import('fs/promises');
    
    try {
      const files = await fs.readdir(workflowDir);
      const yamlFiles = files.filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));

      for (const file of yamlFiles) {
        const workflowPath = join(workflowDir, file);
        const workflowContent = await fs.readFile(workflowPath, 'utf-8');
        const workflow = yaml.parse(workflowContent);
        
        this.workflows.set(workflow.metadata.name, workflow);
        console.log(`Loaded workflow: ${workflow.metadata.name}`);
      }
    } catch (error) {
      console.error('Failed to load workflows:', error);
    }
  }

  async initializeExecutors() {
    // Initialize API executor
    this.executors.set('api', new APIExecutor(this.config.api));
    
    // Initialize agent executor
    this.executors.set('agent', new AgentExecutor(this.config.agent));
    
    // Initialize tool executor
    this.executors.set('tool', new ToolExecutor(this.config.tool));
  }

  async validateWorkflow(workflowName) {
    const workflow = this.workflows.get(workflowName);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowName}`);
    }

    // Validate workflow structure
    this.validateWorkflowStructure(workflow);
    
    // Validate step dependencies
    this.validateStepDependencies(workflow);
    
    // Validate URN references
    await this.validateURNReferences(workflow);

    console.log(`Workflow ${workflowName} validation passed`);
    return true;
  }

  validateWorkflowStructure(workflow) {
    if (!workflow.metadata || !workflow.spec) {
      throw new Error('Invalid workflow structure');
    }

    if (!workflow.spec.steps || !Array.isArray(workflow.spec.steps)) {
      throw new Error('Workflow must have steps');
    }

    // Validate each step
    workflow.spec.steps.forEach((step, index) => {
      if (!step.id || !step.type) {
        throw new Error(`Step ${index} must have id and type`);
      }
    });
  }

  validateStepDependencies(workflow) {
    const stepIds = new Set(workflow.spec.steps.map(step => step.id));
    
    workflow.spec.steps.forEach(step => {
      if (step.dependencies) {
        step.dependencies.forEach(dep => {
          if (!stepIds.has(dep)) {
            throw new Error(`Step ${step.id} depends on unknown step: ${dep}`);
          }
        });
      }
    });
  }

  async validateURNReferences(workflow) {
    // This would validate that all URN references in the workflow
    // point to existing protocols or agents
    // Implementation depends on your URN validation logic
  }

  async executeWorkflow(workflowName, inputs) {
    const workflow = this.workflows.get(workflowName);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowName}`);
    }

    console.log(`Executing workflow: ${workflowName}`);
    const results = {};
    const executionOrder = this.calculateExecutionOrder(workflow);

    for (const stepId of executionOrder) {
      const step = workflow.spec.steps.find(s => s.id === stepId);
      try {
        console.log(`Executing step: ${step.id}`);
        const result = await this.executeStep(step, inputs, results);
        results[step.id] = result;
        console.log(`Step ${step.id} completed successfully`);
      } catch (error) {
        console.error(`Step ${step.id} failed:`, error);
        
        // Handle step failure
        if (step.onError === 'fail') {
          throw error;
        } else if (step.onError === 'rollback') {
          await this.rollbackWorkflow(workflow, results, stepId);
          throw error;
        }
      }
    }

    return results;
  }

  calculateExecutionOrder(workflow) {
    const steps = workflow.spec.steps;
    const visited = new Set();
    const order = [];

    function visit(stepId) {
      if (visited.has(stepId)) return;
      
      const step = steps.find(s => s.id === stepId);
      if (step.dependencies) {
        step.dependencies.forEach(dep => visit(dep));
      }
      
      visited.add(stepId);
      order.push(stepId);
    }

    steps.forEach(step => visit(step.id));
    return order;
  }

  async executeStep(step, inputs, previousResults) {
    const executor = this.executors.get(step.type);
    if (!executor) {
      throw new Error(`Unknown step type: ${step.type}`);
    }

    const resolvedArgs = this.resolveTemplate(step.args, inputs, previousResults);
    return await executor.execute(step, resolvedArgs);
  }

  resolveTemplate(template, inputs, previousResults) {
    let resolved = JSON.stringify(template);
    
    // Replace input references
    Object.keys(inputs).forEach(key => {
      resolved = resolved.replace(new RegExp(`{{ inputs.${key} }}`, 'g'), JSON.stringify(inputs[key]));
    });

    // Replace step output references
    Object.keys(previousResults).forEach(stepId => {
      Object.keys(previousResults[stepId]).forEach(outputKey => {
        resolved = resolved.replace(
          new RegExp(`{{ steps.${stepId}.outputs.${outputKey} }}`, 'g'),
          JSON.stringify(previousResults[stepId][outputKey])
        );
      });
    });

    return JSON.parse(resolved);
  }

  async rollbackWorkflow(workflow, results, failedStepId) {
    console.log(`Rolling back workflow from step: ${failedStepId}`);
    
    // Implement rollback logic based on workflow definition
    // This would execute compensation steps in reverse order
  }

  async getWorkflowStatus(workflowName) {
    const workflow = this.workflows.get(workflowName);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowName}`);
    }

    return {
      name: workflow.metadata.name,
      version: workflow.metadata.version,
      description: workflow.metadata.description,
      steps: workflow.spec.steps.length,
      inputs: Object.keys(workflow.spec.inputs || {}),
      outputs: Object.keys(workflow.spec.outputs || {})
    };
  }

  async listWorkflows() {
    return Array.from(this.workflows.keys());
  }
}

// Executor classes
class APIExecutor {
  constructor(config) {
    this.config = config;
  }

  async execute(step, args) {
    // Implement API execution logic
    console.log(`Executing API step: ${step.id}`);
    return { result: 'API execution result' };
  }
}

class AgentExecutor {
  constructor(config) {
    this.config = config;
  }

  async execute(step, args) {
    // Implement agent execution logic
    console.log(`Executing agent step: ${step.id}`);
    return { result: 'Agent execution result' };
  }
}

class ToolExecutor {
  constructor(config) {
    this.config = config;
  }

  async execute(step, args) {
    // Implement tool execution logic
    console.log(`Executing tool step: ${step.id}`);
    return { result: 'Tool execution result' };
  }
}

export default WorkflowIntegrationService;
```

### Step 3: Create Workflow Integration App

Create `src/apps/workflow-integration-app.js`:

```javascript
import WorkflowIntegrationService from '../services/workflow-integration.js';

class WorkflowIntegrationApp {
  constructor(config) {
    this.config = config;
    this.workflowService = new WorkflowIntegrationService(config);
  }

  async initialize() {
    await this.workflowService.initialize();
    console.log('Workflow integration app initialized');
  }

  async validateAllWorkflows() {
    const workflows = await this.workflowService.listWorkflows();
    
    for (const workflowName of workflows) {
      try {
        await this.workflowService.validateWorkflow(workflowName);
        console.log(`✅ Workflow ${workflowName} validation passed`);
      } catch (error) {
        console.error(`❌ Workflow ${workflowName} validation failed:`, error.message);
      }
    }
  }

  async executeDataPipeline(dataSource, processingOptions = {}) {
    return await this.workflowService.executeWorkflow('data-pipeline', {
      dataSource,
      processingOptions
    });
  }

  async getWorkflowStatus(workflowName) {
    return await this.workflowService.getWorkflowStatus(workflowName);
  }

  async shutdown() {
    // Cleanup resources
    console.log('Workflow integration app shutdown');
  }
}

// Start the app
const app = new WorkflowIntegrationApp({
  api: {
    baseUrl: 'http://localhost:3000',
    timeout: 10000
  },
  agent: {
    baseUrl: 'http://localhost:3001',
    timeout: 15000
  },
  tool: {
    endpoint: 'npx @modelcontextprotocol/server-filesystem',
    timeout: 30000
  }
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await app.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await app.shutdown();
  process.exit(0);
});

// Start the application
app.initialize()
  .then(async () => {
    console.log('Workflow integration app started');
    
    // Validate all workflows
    await app.validateAllWorkflows();
    
    // Example usage
    const result = await app.executeDataPipeline('database-1', {
      batchSize: 1000,
      parallel: true
    });
    console.log('Data pipeline result:', result);
  })
  .catch(error => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
```

---

## Runtime Integration

### Overview

This guide shows how to integrate OSSP-AGI's runtime components into your applications.

### Step 1: Create Runtime Integration Service

Create `src/services/runtime-integration.js`:

```javascript
import { createAgentDiscoveryService } from '@ossp-agi/runtime';
import { createA2AClient } from '@ossp-agi/runtime';
import { createMCPClient } from '@ossp-agi/runtime';
import { createURNRegistry } from '@ossp-agi/runtime';
import { createACMGenerator } from '@ossp-agi/runtime';
import { createWellKnownServer } from '@ossp-agi/runtime';

class RuntimeIntegrationService {
  constructor(config) {
    this.config = config;
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
    this.registry = null;
    this.acmGenerator = null;
    this.wellKnownServer = null;
  }

  async initialize() {
    // Initialize discovery service
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true,
      cacheTtl: 300000,
      maxResults: 100
    });
    await this.discovery.initialize();

    // Initialize A2A client
    this.a2aClient = createA2AClient({
      baseUrl: this.config.a2aBaseUrl,
      enableLogging: true,
      timeout: 10000,
      maxRetries: 3,
      retryDelay: 1000,
      retryBackoff: 2,
      enableMetrics: true,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000
    });

    // Initialize MCP client
    this.mcpClient = createMCPClient({
      endpoint: this.config.mcpEndpoint,
      enableLogging: true,
      timeout: 15000,
      heartbeatInterval: 30000,
      maxRetries: 3,
      enableMetrics: true,
      circuitBreakerThreshold: 3,
      circuitBreakerTimeout: 30000
    });

    // Initialize URN registry
    this.registry = createURNRegistry({
      dataDir: this.config.registryDataDir || './data/registry',
      enableLogging: true,
      maxAgents: 1000
    });
    await this.registry.initialize();

    // Initialize ACM generator
    this.acmGenerator = createACMGenerator({
      enableLogging: true,
      validateSchema: true
    });

    // Initialize well-known server
    this.wellKnownServer = createWellKnownServer({
      port: this.config.wellKnownPort || 3000,
      host: this.config.wellKnownHost || 'localhost',
      enableLogging: true,
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        headers: ['Content-Type']
      }
    });

    console.log('Runtime integration service initialized');
  }

  async discoverAgents(query) {
    return await this.discovery.discoverAgents(query);
  }

  async getAgent(urn) {
    return await this.discovery.getAgent(urn);
  }

  async registerAgent(agentData) {
    return await this.registry.registerAgent(agentData);
  }

  async communicateWithAgent(agentUrn, route, data) {
    return await this.a2aClient.request(agentUrn, route, {
      method: 'POST',
      body: data
    });
  }

  async executeMCPTool(toolName, input) {
    const isConnected = this.mcpClient.isConnected();
    if (!isConnected) {
      await this.mcpClient.open();
    }

    try {
      return await this.mcpClient.executeTool(toolName, input);
    } finally {
      if (!isConnected) {
        await this.mcpClient.close();
      }
    }
  }

  async generateACM(agentConfig) {
    return await this.acmGenerator.createACM(agentConfig);
  }

  async startWellKnownServer() {
    await this.wellKnownServer.start();
    console.log('Well-known server started');
  }

  async stopWellKnownServer() {
    await this.wellKnownServer.stop();
    console.log('Well-known server stopped');
  }

  async getHealth() {
    return {
      discovery: this.discovery.getHealth(),
      a2a: this.a2aClient.getHealth(),
      mcp: this.mcpClient.getState(),
      registry: this.registry.getHealth(),
      wellKnown: this.wellKnownServer.getStatus()
    };
  }

  async getStats() {
    return {
      discovery: this.discovery.getStats(),
      registry: this.registry.getStats(),
      a2a: this.a2aClient.getStatus(),
      mcp: this.mcpClient.getState()
    };
  }

  async shutdown() {
    if (this.wellKnownServer && this.wellKnownServer.isRunning()) {
      await this.wellKnownServer.stop();
    }
    if (this.mcpClient && this.mcpClient.isConnected()) {
      await this.mcpClient.close();
    }
    if (this.discovery) {
      await this.discovery.shutdown();
    }
    if (this.registry) {
      await this.registry.shutdown();
    }
    console.log('Runtime integration service shutdown');
  }
}

export default RuntimeIntegrationService;
```

### Step 2: Create Runtime Integration App

Create `src/apps/runtime-integration-app.js`:

```javascript
import RuntimeIntegrationService from '../services/runtime-integration.js';

class RuntimeIntegrationApp {
  constructor(config) {
    this.config = config;
    this.runtimeService = new RuntimeIntegrationService(config);
  }

  async initialize() {
    await this.runtimeService.initialize();
    console.log('Runtime integration app initialized');
  }

  async start() {
    // Start well-known server
    await this.runtimeService.startWellKnownServer();
    
    // Register example agents
    await this.registerExampleAgents();
    
    console.log('Runtime integration app started');
  }

  async registerExampleAgents() {
    const exampleAgents = [
      {
        urn: 'urn:agent:ai:data-processor@1.0.0',
        name: 'Data Processor Agent',
        version: '1.0.0',
        description: 'AI agent for data processing tasks',
        capabilities: {
          tools: [
            { name: 'process_data', description: 'Process structured data' },
            { name: 'validate_data', description: 'Validate data quality' }
          ],
          resources: ['data-storage', 'compute-resources'],
          prompts: ['data-analysis', 'quality-check']
        },
        endpoints: {
          api: '/api/v1',
          health: '/health'
        }
      },
      {
        urn: 'urn:agent:ai:content-generator@1.0.0',
        name: 'Content Generator Agent',
        version: '1.0.0',
        description: 'AI agent for content generation',
        capabilities: {
          tools: [
            { name: 'generate_text', description: 'Generate text content' },
            { name: 'summarize_text', description: 'Summarize text content' }
          ],
          resources: ['language-models', 'content-database'],
          prompts: ['creative-writing', 'technical-writing']
        },
        endpoints: {
          api: '/api/v1',
          health: '/health'
        }
      }
    ];

    for (const agent of exampleAgents) {
      try {
        await this.runtimeService.registerAgent(agent);
        console.log(`Registered agent: ${agent.name}`);
      } catch (error) {
        console.error(`Failed to register agent ${agent.name}:`, error);
      }
    }
  }

  async demonstrateCapabilities() {
    console.log('Demonstrating runtime capabilities...');

    // Discover agents
    const agents = await this.runtimeService.discoverAgents({
      domain: 'ai',
      capabilities: ['data-processing']
    });
    console.log(`Discovered ${agents.total} agents`);

    // Get specific agent
    const agent = await this.runtimeService.getAgent('urn:agent:ai:data-processor@1.0.0');
    if (agent) {
      console.log('Found data processor agent:', agent.name);
    }

    // Generate ACM
    const acm = await this.runtimeService.generateACM({
      urn: 'urn:agent:ai:custom-agent@1.0.0',
      name: 'Custom Agent',
      version: '1.0.0',
      description: 'Custom AI agent',
      capabilities: {
        tools: [{ name: 'custom_tool', description: 'Custom tool' }]
      },
      endpoints: {
        api: '/api/v1',
        health: '/health'
      }
    });
    console.log('Generated ACM:', acm);

    // Get health status
    const health = await this.runtimeService.getHealth();
    console.log('Health status:', health);

    // Get statistics
    const stats = await this.runtimeService.getStats();
    console.log('Statistics:', stats);
  }

  async shutdown() {
    await this.runtimeService.shutdown();
    console.log('Runtime integration app shutdown');
  }
}

// Start the app
const app = new RuntimeIntegrationApp({
  a2aBaseUrl: 'http://localhost:3000',
  mcpEndpoint: 'npx @modelcontextprotocol/server-filesystem',
  registryDataDir: './data/registry',
  wellKnownPort: 3000,
  wellKnownHost: 'localhost'
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await app.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await app.shutdown();
  process.exit(0);
});

// Start the application
app.initialize()
  .then(async () => {
    await app.start();
    await app.demonstrateCapabilities();
  })
  .catch(error => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
```

---

## CI/CD Integration

### Overview

This guide shows how to integrate OSSP-AGI into your CI/CD pipeline for automated protocol validation and governance generation.

### Step 1: Create CI/CD Configuration

Create `.github/workflows/ossp-agi.yml`:

```yaml
name: OSSP-AGI Integration

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM

jobs:
  discover-protocols:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install OSSP-AGI
        run: npm install -g @ossp-agi/cli
        
      - name: Discover APIs
        run: |
          ossp discover api https://api.user-service.com/openapi.json --output ./artifacts/user-service
          ossp discover api https://api.order-service.com/openapi.json --output ./artifacts/order-service
          ossp discover api https://api.payment-service.com/openapi.json --output ./artifacts/payment-service
          
      - name: Discover Events
        run: |
          ossp discover event https://api.example.com/asyncapi.json --output ./artifacts/events --detect-patterns
          
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: discovered-protocols
          path: artifacts/

  validate-protocols:
    runs-on: ubuntu-latest
    needs: discover-protocols
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install OSSP-AGI
        run: npm install -g @ossp-agi/cli
        
      - name: Download artifacts
        uses: actions/download-artifact@v3
        with:
          name: discovered-protocols
          path: artifacts/
          
      - name: Validate ecosystem
        run: ossp validate --ecosystem --manifests ./artifacts --verbose
        
      - name: Validate workflows
        run: |
          for workflow in workflows/*.yaml; do
            ossp workflow validate "$workflow"
          done

  generate-governance:
    runs-on: ubuntu-latest
    needs: [discover-protocols, validate-protocols]
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install OSSP-AGI
        run: npm install -g @ossp-agi/cli
        
      - name: Download artifacts
        uses: actions/download-artifact@v3
        with:
          name: discovered-protocols
          path: artifacts/
          
      - name: Generate governance
        run: ossp governance --manifests ./artifacts --output ./GOVERNANCE.md
        
      - name: Generate API clients
        run: node scripts/generate-api-clients.js
        
      - name: Commit changes
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add .
          git commit -m "Update governance and generated clients [skip ci]" || exit 0
          git push

  security-scan:
    runs-on: ubuntu-latest
    needs: validate-protocols
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install OSSP-AGI
        run: npm install -g @ossp-agi/cli
        
      - name: Download artifacts
        uses: actions/download-artifact@v3
        with:
          name: discovered-protocols
          path: artifacts/
          
      - name: Security validation
        run: ossp validate --ecosystem --manifests ./artifacts --security --strict
        
      - name: PII detection
        run: ossp validate --ecosystem --manifests ./artifacts --pii-detection

  performance-test:
    runs-on: ubuntu-latest
    needs: validate-protocols
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install OSSP-AGI
        run: npm install -g @ossp-agi/cli
        
      - name: Download artifacts
        uses: actions/download-artifact@v3
        with:
          name: discovered-protocols
          path: artifacts/
          
      - name: Performance validation
        run: ossp validate --ecosystem --manifests ./artifacts --performance --timeout 30
```

### Step 2: Create Pre-commit Hooks

Create `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: local
    hooks:
      - id: ossp-agi-validate
        name: OSSP-AGI Protocol Validation
        entry: ossp validate --ecosystem --manifests ./artifacts
        language: system
        files: '^artifacts/.*\.json$'
        
      - id: ossp-agi-governance
        name: OSSP-AGI Governance Check
        entry: ossp governance --manifests ./artifacts --check
        language: system
        files: '^artifacts/.*\.json$'
        
      - id: ossp-agi-workflow-validate
        name: OSSP-AGI Workflow Validation
        entry: ossp workflow validate
        language: system
        files: '^workflows/.*\.yaml$'
```

### Step 3: Create Docker Integration

Create `Dockerfile.ossp-agi`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install OSSP-AGI
RUN npm install -g @ossp-agi/cli

# Copy artifacts
COPY artifacts/ ./artifacts/
COPY workflows/ ./workflows/

# Validate on build
RUN ossp validate --ecosystem --manifests ./artifacts

# Generate governance
RUN ossp governance --manifests ./artifacts --output ./GOVERNANCE.md

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "src/app.js"]
```

### Step 4: Create Kubernetes Integration

Create `k8s/ossp-agi-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ossp-agi-integration
  labels:
    app: ossp-agi-integration
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ossp-agi-integration
  template:
    metadata:
      labels:
        app: ossp-agi-integration
    spec:
      containers:
      - name: ossp-agi-integration
        image: ossp-agi-integration:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: A2A_BASE_URL
          value: "http://a2a-service:3000"
        - name: MCP_ENDPOINT
          value: "npx @modelcontextprotocol/server-filesystem"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        volumeMounts:
        - name: artifacts
          mountPath: /app/artifacts
        - name: workflows
          mountPath: /app/workflows
      volumes:
      - name: artifacts
        configMap:
          name: ossp-agi-artifacts
      - name: workflows
        configMap:
          name: ossp-agi-workflows
---
apiVersion: v1
kind: Service
metadata:
  name: ossp-agi-integration-service
spec:
  selector:
    app: ossp-agi-integration
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ossp-agi-artifacts
data:
  user-service-protocol.json: |
    {
      "apiVersion": "api/v1.1.1",
      "kind": "APIManifest",
      "api": {
        "id": "user-service",
        "name": "User Service API",
        "version": "1.0.0"
      }
    }
  order-service-protocol.json: |
    {
      "apiVersion": "api/v1.1.1",
      "kind": "APIManifest",
      "api": {
        "id": "order-service",
        "name": "Order Service API",
        "version": "1.0.0"
      }
    }
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ossp-agi-workflows
data:
  microservices-integration.yaml: |
    apiVersion: workflow.v1
    kind: Workflow
    metadata:
      name: microservices-integration
      version: "1.0.0"
    spec:
      steps: []
```

---

## Troubleshooting

### Common Issues

#### 1. Protocol Discovery Failures

**Problem:** API discovery fails with network errors

**Solution:**
```bash
# Check network connectivity
ping api.example.com

# Try with verbose output
ossp discover api https://api.example.com/openapi.json --verbose

# Check if the API spec is accessible
curl -I https://api.example.com/openapi.json
```

#### 2. Validation Errors

**Problem:** Ecosystem validation fails with URN resolution errors

**Solution:**
```bash
# Validate with detailed output
ossp validate --ecosystem --verbose --manifests ./artifacts

# Check URN references
ossp validate --ecosystem --manifests ./artifacts --check-urns

# Fix URN references
ossp validate --ecosystem --manifests ./artifacts --fix
```

#### 3. Runtime Connection Issues

**Problem:** A2A or MCP client connection failures

**Solution:**
```javascript
// Check connection status
const health = await runtimeService.getHealth();
console.log('Health status:', health);

// Reset circuit breaker
await a2aClient.reset();

// Check MCP connection
const state = await mcpClient.getState();
console.log('MCP state:', state);
```

#### 4. Performance Issues

**Problem:** Slow validation or discovery operations

**Solution:**
```bash
# Use caching
ossp discover api https://api.example.com/openapi.json --cache

# Increase timeout
ossp validate --ecosystem --manifests ./artifacts --timeout 60

# Use parallel processing
ossp validate --ecosystem --manifests ./artifacts --parallel
```

#### 5. Memory Issues

**Problem:** Out of memory errors during large operations

**Solution:**
```bash
# Increase Node.js memory limit
node --max-old-space-size=4096 node_modules/.bin/ossp validate --ecosystem

# Use streaming mode
ossp discover api https://api.example.com/openapi.json --streaming

# Process in batches
ossp validate --ecosystem --manifests ./artifacts --batch-size 100
```

### Debugging Tips

1. **Enable Verbose Logging**
   ```bash
   export OSSP_AGI_LOG_LEVEL=debug
   ossp validate --ecosystem --verbose
   ```

2. **Use Trace Mode**
   ```bash
   ossp validate --ecosystem --trace --manifests ./artifacts
   ```

3. **Check Configuration**
   ```bash
   ossp config show
   ossp config validate
   ```

4. **Monitor Performance**
   ```bash
   ossp validate --ecosystem --performance --manifests ./artifacts
   ```

5. **Test Connectivity**
   ```bash
   ossp test connectivity
   ossp test discovery
   ossp test validation
   ```

### Getting Help

- **Documentation:** [docs/](docs/)
- **Examples:** [examples/](examples/)
- **Issues:** [GitHub Issues](https://github.com/your-org/ossp-agi/issues)
- **Discussions:** [GitHub Discussions](https://github.com/your-org/ossp-agi/discussions)

---

*Generated for Mission B10.8 - Internal Developer Documentation*
*Last Updated: 2025-01-09*
