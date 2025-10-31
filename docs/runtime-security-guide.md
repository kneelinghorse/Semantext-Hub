# Runtime Security Guide

This guide provides comprehensive security best practices for the Semantext Hub runtime components, covering authentication, authorization, data protection, and security monitoring.

## Table of Contents

- [Security Overview](#security-overview)
- [Authentication and Authorization](#authentication-and-authorization)
- [Data Protection](#data-protection)
- [Network Security](#network-security)
- [Input Validation](#input-validation)
- [Error Handling Security](#error-handling-security)
- [Logging and Monitoring](#logging-and-monitoring)
- [Security Testing](#security-testing)
- [Incident Response](#incident-response)
- [Compliance](#compliance)

## Security Overview

### Security Principles

The runtime components follow these security principles:

1. **Defense in Depth**: Multiple layers of security controls
2. **Least Privilege**: Minimum necessary permissions
3. **Fail Secure**: Secure defaults and graceful degradation
4. **Security by Design**: Built-in security from the ground up
5. **Continuous Monitoring**: Ongoing security assessment

### Threat Model

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| Unauthorized Access | High | Medium | Authentication, Authorization |
| Data Breach | High | Low | Encryption, Access Controls |
| Injection Attacks | Medium | Medium | Input Validation, Sanitization |
| Denial of Service | Medium | High | Rate Limiting, Circuit Breakers |
| Man-in-the-Middle | High | Low | TLS, Certificate Validation |

### Security Controls

- **Authentication**: Bearer tokens, API keys, certificates
- **Authorization**: Role-based access control, URN-based permissions
- **Encryption**: TLS in transit, encryption at rest
- **Validation**: Input sanitization, URN validation
- **Monitoring**: Security logging, anomaly detection
- **Rate Limiting**: Request throttling, abuse prevention

## Authentication and Authorization

### A2A Authentication

Implement secure A2A authentication:

```javascript
// examples/a2a-security.js
import { createA2AClient } from '../app/runtime/a2a-client.js';

class A2ASecurity {
  constructor() {
    this.a2aClient = null;
    this.authProvider = null;
  }
  
  async initialize() {
    // Initialize with security settings
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'https://localhost:3000',
      enableLogging: true,
      timeout: 10000,
      maxRetries: 3,
      // Security settings
      validateCertificates: true,
      rejectUnauthorized: true
    });
    
    // Initialize auth provider
    this.authProvider = new SecureAuthProvider({
      tokenEndpoint: process.env.AUTH_TOKEN_ENDPOINT,
      clientId: process.env.AUTH_CLIENT_ID,
      clientSecret: process.env.AUTH_CLIENT_SECRET,
      scope: 'a2a:communicate'
    });
  }
  
  // Secure request with authentication
  async secureRequest(agentUrn, route, options) {
    // Validate URN format
    if (!this.validateUrn(agentUrn)) {
      throw new Error('Invalid agent URN format');
    }
    
    // Get authentication token
    const token = await this.authProvider.getToken();
    
    // Add security headers
    const secureOptions = {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'X-Request-ID': this.generateRequestId(),
        'X-Timestamp': new Date().toISOString(),
        'X-Signature': await this.generateSignature(agentUrn, route, options)
      }
    };
    
    // Make request
    return await this.a2aClient.request(agentUrn, route, secureOptions);
  }
  
  // Validate URN format
  validateUrn(urn) {
    const urnRegex = /^urn:agent:[a-zA-Z0-9-]+:[a-zA-Z0-9-]+(@[0-9]+\.[0-9]+\.[0-9]+)?$/;
    return urnRegex.test(urn);
  }
  
  // Generate request signature
  async generateSignature(agentUrn, route, options) {
    const payload = {
      agentUrn,
      route,
      method: options.method || 'POST',
      timestamp: new Date().toISOString()
    };
    
    const payloadString = JSON.stringify(payload);
    const signature = await this.authProvider.sign(payloadString);
    
    return signature;
  }
  
  // Generate unique request ID
  generateRequestId() {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Secure Auth Provider
class SecureAuthProvider {
  constructor(config) {
    this.config = config;
    this.tokenCache = new Map();
    this.tokenExpiry = new Map();
  }
  
  async getToken() {
    const cacheKey = this.config.clientId;
    
    // Check cache
    if (this.tokenCache.has(cacheKey)) {
      const expiry = this.tokenExpiry.get(cacheKey);
      if (Date.now() < expiry) {
        return this.tokenCache.get(cacheKey);
      }
    }
    
    // Fetch new token
    const token = await this.fetchToken();
    
    // Cache token
    this.tokenCache.set(cacheKey, token.access_token);
    this.tokenExpiry.set(cacheKey, Date.now() + (token.expires_in * 1000));
    
    return token.access_token;
  }
  
  async fetchToken() {
    const response = await fetch(this.config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: this.config.scope
      })
    });
    
    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.statusText}`);
    }
    
    return await response.json();
  }
  
  async sign(payload) {
    // Implement HMAC signing
    const crypto = await import('crypto');
    const hmac = crypto.createHmac('sha256', this.config.clientSecret);
    hmac.update(payload);
    return hmac.digest('hex');
  }
}

// Usage
const a2aSecurity = new A2ASecurity();
await a2aSecurity.initialize();

// Make secure request
const response = await a2aSecurity.secureRequest(
  'urn:agent:ai:ml-agent@1.0.0',
  '/api/inference',
  { method: 'POST', body: { input: 'secure data' } }
);
```

### MCP Security

Implement secure MCP communication:

```javascript
// examples/mcp-security.js
import { createMCPClient } from '../app/runtime/mcp-client.js';

class MCPSecurity {
  constructor() {
    this.mcpClient = null;
    this.allowedTools = new Set();
    this.toolPermissions = new Map();
  }
  
  async initialize() {
    // Initialize with security settings
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true,
      timeout: 15000,
      // Security settings
      validateToolSchemas: true,
      sanitizeInputs: true
    });
    
    // Load tool permissions
    await this.loadToolPermissions();
  }
  
  // Load tool permissions from configuration
  async loadToolPermissions() {
    const permissions = {
      'read_file': { allowed: true, maxSize: 1024 * 1024 }, // 1MB
      'write_file': { allowed: false },
      'list_directory': { allowed: true, maxDepth: 3 },
      'execute_command': { allowed: false }
    };
    
    for (const [tool, config] of Object.entries(permissions)) {
      this.toolPermissions.set(tool, config);
      if (config.allowed) {
        this.allowedTools.add(tool);
      }
    }
  }
  
  // Secure tool execution
  async secureExecuteTool(toolName, input, context) {
    // Check if tool is allowed
    if (!this.allowedTools.has(toolName)) {
      throw new Error(`Tool ${toolName} is not allowed`);
    }
    
    // Get tool permissions
    const permissions = this.toolPermissions.get(toolName);
    
    // Validate input
    const validatedInput = await this.validateToolInput(toolName, input, permissions);
    
    // Check context permissions
    if (!this.checkContextPermissions(context, toolName)) {
      throw new Error('Insufficient permissions for tool execution');
    }
    
    // Execute tool
    const result = await this.mcpClient.executeTool(toolName, validatedInput);
    
    // Sanitize output
    const sanitizedResult = await this.sanitizeToolOutput(toolName, result);
    
    return sanitizedResult;
  }
  
  // Validate tool input
  async validateToolInput(toolName, input, permissions) {
    const validatedInput = { ...input };
    
    // Validate file paths
    if (input.path) {
      if (!this.isValidPath(input.path)) {
        throw new Error('Invalid file path');
      }
      
      // Check path traversal
      if (input.path.includes('..') || input.path.includes('~')) {
        throw new Error('Path traversal detected');
      }
    }
    
    // Validate file size
    if (permissions.maxSize && input.size > permissions.maxSize) {
      throw new Error('File size exceeds limit');
    }
    
    // Validate depth
    if (permissions.maxDepth && input.depth > permissions.maxDepth) {
      throw new Error('Directory depth exceeds limit');
    }
    
    return validatedInput;
  }
  
  // Check context permissions
  checkContextPermissions(context, toolName) {
    // Implement role-based access control
    const userRoles = context.roles || [];
    const requiredRoles = this.getRequiredRoles(toolName);
    
    return requiredRoles.some(role => userRoles.includes(role));
  }
  
  // Get required roles for tool
  getRequiredRoles(toolName) {
    const roleMap = {
      'read_file': ['reader', 'admin'],
      'write_file': ['writer', 'admin'],
      'list_directory': ['reader', 'admin'],
      'execute_command': ['admin']
    };
    
    return roleMap[toolName] || ['admin'];
  }
  
  // Validate file path
  isValidPath(path) {
    // Check for valid path format
    const pathRegex = /^[a-zA-Z0-9._/-]+$/;
    return pathRegex.test(path);
  }
  
  // Sanitize tool output
  async sanitizeToolOutput(toolName, result) {
    const sanitized = { ...result };
    
    // Remove sensitive information
    if (sanitized.content) {
      sanitized.content = sanitized.content.map(item => {
        if (typeof item === 'string') {
          // Remove potential secrets
          return item.replace(/password[=:]\s*\S+/gi, 'password=***');
        }
        return item;
      });
    }
    
    return sanitized;
  }
}

// Usage
const mcpSecurity = new MCPSecurity();
await mcpSecurity.initialize();

// Execute secure tool
const result = await mcpSecurity.secureExecuteTool(
  'read_file',
  { path: '/safe/path/file.txt' },
  { roles: ['reader'] }
);
```

## Data Protection

### Encryption

Implement data encryption:

```javascript
// examples/data-encryption.js
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';

class DataEncryption {
  constructor() {
    this.discovery = null;
    this.encryptionKey = null;
  }
  
  async initialize() {
    // Initialize discovery service
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    // Initialize encryption
    this.encryptionKey = await this.generateEncryptionKey();
  }
  
  // Generate encryption key
  async generateEncryptionKey() {
    const crypto = await import('crypto');
    return crypto.randomBytes(32);
  }
  
  // Encrypt sensitive data
  async encryptData(data) {
    const crypto = await import('crypto');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      encrypted,
      iv: iv.toString('hex')
    };
  }
  
  // Decrypt sensitive data
  async decryptData(encryptedData) {
    const crypto = await import('crypto');
    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }
  
  // Secure agent registration
  async secureRegisterAgent(agentData) {
    // Encrypt sensitive fields
    const sensitiveFields = ['description', 'capabilities'];
    const encryptedData = { ...agentData };
    
    for (const field of sensitiveFields) {
      if (encryptedData[field]) {
        encryptedData[field] = await this.encryptData(encryptedData[field]);
      }
    }
    
    // Register agent
    return await this.discovery.registerAgent(encryptedData);
  }
  
  // Secure agent retrieval
  async secureGetAgent(urn) {
    // Get agent data
    const agent = await this.discovery.getAgent(urn);
    
    if (!agent) {
      return null;
    }
    
    // Decrypt sensitive fields
    const sensitiveFields = ['description', 'capabilities'];
    const decryptedData = { ...agent };
    
    for (const field of sensitiveFields) {
      if (decryptedData[field] && typeof decryptedData[field] === 'object') {
        decryptedData[field] = await this.decryptData(decryptedData[field]);
      }
    }
    
    return decryptedData;
  }
}

// Usage
const dataEncryption = new DataEncryption();
await dataEncryption.initialize();

// Register agent with encryption
const agentData = {
  urn: 'urn:agent:ai:ml-agent@1.0.0',
  name: 'ml-agent',
  version: '1.0.0',
  description: 'Sensitive ML agent description',
  capabilities: { 'ml-inference': { type: 'service' } }
};

const registeredAgent = await dataEncryption.secureRegisterAgent(agentData);

// Retrieve agent with decryption
const retrievedAgent = await dataEncryption.secureGetAgent('urn:agent:ai:ml-agent@1.0.0');
```

### MCP Data Discovery Safeguards

- `protocol_discover_data` executes introspection through the `PostgresImporter`, which issues `BEGIN READ ONLY` transactions and enforces 30s connection / 5s query timeouts to prevent accidental writes or long-running scans.
- Connection strings are sanitized before being logged or returned to MCP clients (credentials and sensitive query parameters are replaced with `***`). Operators should verify that downstream runbooks and observability tooling consume only the sanitized value.
- Provide the tool with least-privilege credentials (read-only role limited to the target schema) and rotate them regularly; the importer never persists the raw connection string once the session terminates.

## Network Security

### TLS Configuration

Implement secure TLS configuration:

```javascript
// examples/tls-security.js
import { createA2AClient } from '../app/runtime/a2a-client.js';

class TLSSecurity {
  constructor() {
    this.a2aClient = null;
    this.tlsConfig = null;
  }
  
  async initialize() {
    // Configure TLS settings
    this.tlsConfig = {
      rejectUnauthorized: true,
      checkServerIdentity: this.checkServerIdentity.bind(this),
      secureProtocol: 'TLSv1_2_method',
      ciphers: 'ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256',
      honorCipherOrder: true
    };
    
    // Initialize A2A client with TLS
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'https://localhost:3000',
      enableLogging: true,
      timeout: 10000,
      // TLS configuration
      tls: this.tlsConfig
    });
  }
  
  // Custom server identity check
  checkServerIdentity(host, cert) {
    // Implement custom certificate validation
    const expectedHosts = ['localhost', 'api.example.com'];
    
    if (!expectedHosts.includes(host)) {
      throw new Error(`Certificate hostname mismatch: ${host}`);
    }
    
    // Check certificate validity
    const now = new Date();
    const notBefore = new Date(cert.valid_from);
    const notAfter = new Date(cert.valid_to);
    
    if (now < notBefore || now > notAfter) {
      throw new Error('Certificate is not valid');
    }
    
    return undefined; // No error
  }
  
  // Secure request with TLS
  async secureRequest(agentUrn, route, options) {
    // Validate HTTPS URL
    if (!this.a2aClient.baseUrl.startsWith('https://')) {
      throw new Error('HTTPS required for secure communication');
    }
    
    // Add security headers
    const secureOptions = {
      ...options,
      headers: {
        ...options.headers,
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
      }
    };
    
    return await this.a2aClient.request(agentUrn, route, secureOptions);
  }
}

// Usage
const tlsSecurity = new TLSSecurity();
await tlsSecurity.initialize();

// Make secure request
const response = await tlsSecurity.secureRequest(
  'urn:agent:ai:ml-agent@1.0.0',
  '/api/inference',
  { method: 'POST', body: { input: 'secure data' } }
);
```

## Input Validation

### URN Validation

Implement comprehensive URN validation:

```javascript
// examples/urn-validation.js
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';

class URNValidation {
  constructor() {
    this.discovery = null;
    this.validationRules = new Map();
  }
  
  async initialize() {
    // Initialize discovery service
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    // Load validation rules
    this.loadValidationRules();
  }
  
  // Load validation rules
  loadValidationRules() {
    this.validationRules.set('domain', {
      pattern: /^[a-zA-Z0-9-]+$/,
      minLength: 1,
      maxLength: 50,
      message: 'Domain must contain only alphanumeric characters and hyphens'
    });
    
    this.validationRules.set('name', {
      pattern: /^[a-zA-Z0-9-_]+$/,
      minLength: 1,
      maxLength: 100,
      message: 'Name must contain only alphanumeric characters, hyphens, and underscores'
    });
    
    this.validationRules.set('version', {
      pattern: /^[0-9]+\.[0-9]+\.[0-9]+$/,
      message: 'Version must be in semantic version format (x.y.z)'
    });
  }
  
  // Validate URN
  validateUrn(urn) {
    const errors = [];
    
    // Check URN format
    const urnRegex = /^urn:agent:([^:]+):([^@]+)(@([^:]+))?$/;
    const match = urn.match(urnRegex);
    
    if (!match) {
      errors.push('Invalid URN format');
      return { valid: false, errors };
    }
    
    const [, domain, name, , version] = match;
    
    // Validate domain
    const domainValidation = this.validateField('domain', domain);
    if (!domainValidation.valid) {
      errors.push(...domainValidation.errors);
    }
    
    // Validate name
    const nameValidation = this.validateField('name', name);
    if (!nameValidation.valid) {
      errors.push(...nameValidation.errors);
    }
    
    // Validate version if present
    if (version) {
      const versionValidation = this.validateField('version', version);
      if (!versionValidation.valid) {
        errors.push(...versionValidation.errors);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      parsed: { domain, name, version }
    };
  }
  
  // Validate field
  validateField(fieldName, value) {
    const rule = this.validationRules.get(fieldName);
    if (!rule) {
      return { valid: true, errors: [] };
    }
    
    const errors = [];
    
    // Check length
    if (rule.minLength && value.length < rule.minLength) {
      errors.push(`${fieldName} must be at least ${rule.minLength} characters`);
    }
    
    if (rule.maxLength && value.length > rule.maxLength) {
      errors.push(`${fieldName} must be at most ${rule.maxLength} characters`);
    }
    
    // Check pattern
    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push(rule.message);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  // Sanitize URN
  sanitizeUrn(urn) {
    // Remove potentially dangerous characters
    return urn.replace(/[<>\"'%;()&+]/g, '');
  }
  
  // Secure agent registration
  async secureRegisterAgent(agentData) {
    // Validate URN
    const urnValidation = this.validateUrn(agentData.urn);
    if (!urnValidation.valid) {
      throw new Error(`Invalid URN: ${urnValidation.errors.join(', ')}`);
    }
    
    // Sanitize URN
    agentData.urn = this.sanitizeUrn(agentData.urn);
    
    // Validate other fields
    if (agentData.name) {
      const nameValidation = this.validateField('name', agentData.name);
      if (!nameValidation.valid) {
        throw new Error(`Invalid name: ${nameValidation.errors.join(', ')}`);
      }
    }
    
    if (agentData.version) {
      const versionValidation = this.validateField('version', agentData.version);
      if (!versionValidation.valid) {
        throw new Error(`Invalid version: ${versionValidation.errors.join(', ')}`);
      }
    }
    
    // Register agent
    return await this.discovery.registerAgent(agentData);
  }
}

// Usage
const urnValidation = new URNValidation();
await urnValidation.initialize();

// Validate URN
const validation = urnValidation.validateUrn('urn:agent:ai:ml-agent@1.0.0');
console.log('URN validation:', validation);

// Register agent with validation
const agentData = {
  urn: 'urn:agent:ai:ml-agent@1.0.0',
  name: 'ml-agent',
  version: '1.0.0',
  description: 'ML agent'
};

const registeredAgent = await urnValidation.secureRegisterAgent(agentData);
```

## Error Handling Security

### Secure Error Handling

Implement secure error handling:

```javascript
// examples/secure-error-handling.js
import { ErrorHandler } from '../app/runtime/error-handler.js';

class SecureErrorHandling {
  constructor() {
    this.errorHandler = null;
    this.sensitivePatterns = [
      /password[=:]\s*\S+/gi,
      /token[=:]\s*\S+/gi,
      /key[=:]\s*\S+/gi,
      /secret[=:]\s*\S+/gi
    ];
  }
  
  async initialize() {
    // Initialize error handler
    this.errorHandler = new ErrorHandler({
      enableLogging: true,
      enableMetrics: true
    });
  }
  
  // Sanitize error message
  sanitizeErrorMessage(message) {
    let sanitized = message;
    
    // Remove sensitive information
    for (const pattern of this.sensitivePatterns) {
      sanitized = sanitized.replace(pattern, '***');
    }
    
    // Remove stack traces in production
    if (process.env.NODE_ENV === 'production') {
      sanitized = sanitized.split('\n')[0];
    }
    
    return sanitized;
  }
  
  // Secure error handling
  async handleError(error, context) {
    try {
      // Handle error with centralized handler
      const typedError = this.errorHandler.handleError(error, context);
      
      // Sanitize error message
      const sanitizedMessage = this.sanitizeErrorMessage(typedError.message);
      
      // Create secure error response
      const secureError = {
        message: sanitizedMessage,
        code: typedError.code || 'UNKNOWN_ERROR',
        timestamp: new Date().toISOString(),
        requestId: context.requestId || 'unknown'
      };
      
      // Log error securely
      this.logErrorSecurely(typedError, context);
      
      return secureError;
    } catch (handlingError) {
      // Fallback error handling
      return {
        message: 'An error occurred',
        code: 'HANDLING_ERROR',
        timestamp: new Date().toISOString()
      };
    }
  }
  
  // Log error securely
  logErrorSecurely(error, context) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message: this.sanitizeErrorMessage(error.message),
      code: error.code || 'UNKNOWN_ERROR',
      type: error.constructor.name,
      requestId: context.requestId,
      correlationId: context.correlationId,
      // Don't log sensitive context
      context: this.sanitizeContext(context)
    };
    
    console.error(JSON.stringify(logEntry));
  }
  
  // Sanitize context
  sanitizeContext(context) {
    const sanitized = { ...context };
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'key', 'secret', 'authorization'];
    for (const field of sensitiveFields) {
      delete sanitized[field];
    }
    
    // Sanitize remaining values
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeErrorMessage(value);
      }
    }
    
    return sanitized;
  }
}

// Usage
const secureErrorHandling = new SecureErrorHandling();
await secureErrorHandling.initialize();

// Handle error securely
try {
  // Some operation that might fail
  throw new Error('Database connection failed: password=secret123');
} catch (error) {
  const secureError = await secureErrorHandling.handleError(error, {
    requestId: 'req-123',
    correlationId: 'corr-456',
    operation: 'database-query'
  });
  
  console.log('Secure error:', secureError);
}
```

## Logging and Monitoring

### Security Logging

Implement security-focused logging:

```javascript
// examples/security-logging.js
import { createStructuredLogger, LOG_LEVELS } from '../app/runtime/structured-logger.js';

class SecurityLogging {
  constructor() {
    this.logger = null;
    this.securityEvents = [];
  }
  
  async initialize() {
    // Initialize structured logger
    this.logger = createStructuredLogger({
      level: LOG_LEVELS.INFO,
      enableConsole: true,
      enableFile: true,
      enableTracing: true
    });
  }
  
  // Log security event
  logSecurityEvent(eventType, details) {
    const securityEvent = {
      timestamp: new Date().toISOString(),
      eventType,
      severity: this.getSeverity(eventType),
      details: this.sanitizeDetails(details),
      source: 'runtime-components',
      version: '1.0.0'
    };
    
    this.securityEvents.push(securityEvent);
    
    // Log based on severity
    switch (securityEvent.severity) {
      case 'critical':
        this.logger.error('Security event', securityEvent);
        break;
      case 'warning':
        this.logger.warn('Security event', securityEvent);
        break;
      default:
        this.logger.info('Security event', securityEvent);
    }
  }
  
  // Get event severity
  getSeverity(eventType) {
    const severityMap = {
      'authentication_failure': 'warning',
      'authorization_failure': 'warning',
      'invalid_input': 'info',
      'rate_limit_exceeded': 'warning',
      'suspicious_activity': 'critical',
      'data_breach': 'critical',
      'certificate_error': 'warning'
    };
    
    return severityMap[eventType] || 'info';
  }
  
  // Sanitize event details
  sanitizeDetails(details) {
    const sanitized = { ...details };
    
    // Remove sensitive information
    const sensitiveFields = ['password', 'token', 'key', 'secret'];
    for (const field of sensitiveFields) {
      delete sanitized[field];
    }
    
    // Sanitize remaining values
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'string') {
        sanitized[key] = value.replace(/password[=:]\s*\S+/gi, 'password=***');
      }
    }
    
    return sanitized;
  }
  
  // Log authentication failure
  logAuthenticationFailure(details) {
    this.logSecurityEvent('authentication_failure', {
      ...details,
      ip: details.ip || 'unknown',
      userAgent: details.userAgent || 'unknown'
    });
  }
  
  // Log authorization failure
  logAuthorizationFailure(details) {
    this.logSecurityEvent('authorization_failure', {
      ...details,
      resource: details.resource || 'unknown',
      action: details.action || 'unknown'
    });
  }
  
  // Log suspicious activity
  logSuspiciousActivity(details) {
    this.logSecurityEvent('suspicious_activity', {
      ...details,
      pattern: details.pattern || 'unknown',
      frequency: details.frequency || 1
    });
  }
  
  // Get security events
  getSecurityEvents(filter = {}) {
    let events = [...this.securityEvents];
    
    // Apply filters
    if (filter.eventType) {
      events = events.filter(e => e.eventType === filter.eventType);
    }
    
    if (filter.severity) {
      events = events.filter(e => e.severity === filter.severity);
    }
    
    if (filter.since) {
      events = events.filter(e => new Date(e.timestamp) >= new Date(filter.since));
    }
    
    return events;
  }
}

// Usage
const securityLogging = new SecurityLogging();
await securityLogging.initialize();

// Log security events
securityLogging.logAuthenticationFailure({
  username: 'user123',
  ip: '192.168.1.100',
  userAgent: 'Mozilla/5.0...'
});

securityLogging.logAuthorizationFailure({
  username: 'user123',
  resource: '/api/admin',
  action: 'read'
});

securityLogging.logSuspiciousActivity({
  pattern: 'multiple_failed_logins',
  frequency: 5,
  ip: '192.168.1.100'
});

// Get security events
const events = securityLogging.getSecurityEvents({ severity: 'critical' });
console.log('Critical security events:', events);
```

## Security Testing

### Security Test Suite

Implement security testing:

```javascript
// examples/security-testing.js
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class SecurityTesting {
  constructor() {
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
    this.testResults = [];
  }
  
  async initialize() {
    // Initialize runtime components
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true
    });
    
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true
    });
  }
  
  // Run security tests
  async runSecurityTests() {
    console.log('Running security tests...');
    
    const tests = [
      () => this.testUrnValidation(),
      () => this.testInputSanitization(),
      () => this.testAuthentication(),
      () => this.testAuthorization(),
      () => this.testRateLimiting(),
      () => this.testErrorHandling()
    ];
    
    for (const test of tests) {
      try {
        await test();
      } catch (error) {
        console.error('Security test failed:', error.message);
      }
    }
    
    console.log('Security tests completed');
    return this.testResults;
  }
  
  // Test URN validation
  async testUrnValidation() {
    const testCases = [
      { urn: 'urn:agent:ai:ml-agent@1.0.0', expected: true },
      { urn: 'urn:agent:ai:ml-agent', expected: true },
      { urn: 'invalid-urn', expected: false },
      { urn: 'urn:agent:ai:ml-agent@invalid-version', expected: false },
      { urn: 'urn:agent:ai:ml-agent@1.0.0<script>', expected: false }
    ];
    
    for (const testCase of testCases) {
      try {
        // This would use actual URN validation
        const isValid = this.validateUrn(testCase.urn);
        const passed = isValid === testCase.expected;
        
        this.testResults.push({
          test: 'urn_validation',
          input: testCase.urn,
          expected: testCase.expected,
          actual: isValid,
          passed
        });
      } catch (error) {
        this.testResults.push({
          test: 'urn_validation',
          input: testCase.urn,
          expected: testCase.expected,
          actual: false,
          passed: false,
          error: error.message
        });
      }
    }
  }
  
  // Test input sanitization
  async testInputSanitization() {
    const testCases = [
      { input: 'normal input', expected: 'normal input' },
      { input: 'input<script>alert("xss")</script>', expected: 'input' },
      { input: 'input"; DROP TABLE users; --', expected: 'input DROP TABLE users' },
      { input: 'input\n\r\t', expected: 'input' }
    ];
    
    for (const testCase of testCases) {
      try {
        const sanitized = this.sanitizeInput(testCase.input);
        const passed = sanitized === testCase.expected;
        
        this.testResults.push({
          test: 'input_sanitization',
          input: testCase.input,
          expected: testCase.expected,
          actual: sanitized,
          passed
        });
      } catch (error) {
        this.testResults.push({
          test: 'input_sanitization',
          input: testCase.input,
          expected: testCase.expected,
          actual: null,
          passed: false,
          error: error.message
        });
      }
    }
  }
  
  // Test authentication
  async testAuthentication() {
    const testCases = [
      { token: 'valid-token', expected: true },
      { token: 'invalid-token', expected: false },
      { token: '', expected: false },
      { token: null, expected: false }
    ];
    
    for (const testCase of testCases) {
      try {
        const isValid = await this.validateToken(testCase.token);
        const passed = isValid === testCase.expected;
        
        this.testResults.push({
          test: 'authentication',
          input: testCase.token,
          expected: testCase.expected,
          actual: isValid,
          passed
        });
      } catch (error) {
        this.testResults.push({
          test: 'authentication',
          input: testCase.token,
          expected: testCase.expected,
          actual: false,
          passed: false,
          error: error.message
        });
      }
    }
  }
  
  // Test authorization
  async testAuthorization() {
    const testCases = [
      { user: 'admin', resource: '/admin', expected: true },
      { user: 'user', resource: '/admin', expected: false },
      { user: 'admin', resource: '/user', expected: true },
      { user: 'user', resource: '/user', expected: true }
    ];
    
    for (const testCase of testCases) {
      try {
        const hasAccess = await this.checkAuthorization(testCase.user, testCase.resource);
        const passed = hasAccess === testCase.expected;
        
        this.testResults.push({
          test: 'authorization',
          input: `${testCase.user}:${testCase.resource}`,
          expected: testCase.expected,
          actual: hasAccess,
          passed
        });
      } catch (error) {
        this.testResults.push({
          test: 'authorization',
          input: `${testCase.user}:${testCase.resource}`,
          expected: testCase.expected,
          actual: false,
          passed: false,
          error: error.message
        });
      }
    }
  }
  
  // Test rate limiting
  async testRateLimiting() {
    const testCases = [
      { requests: 10, expected: true },
      { requests: 100, expected: false },
      { requests: 1000, expected: false }
    ];
    
    for (const testCase of testCases) {
      try {
        const allowed = await this.testRateLimit(testCase.requests);
        const passed = allowed === testCase.expected;
        
        this.testResults.push({
          test: 'rate_limiting',
          input: testCase.requests,
          expected: testCase.expected,
          actual: allowed,
          passed
        });
      } catch (error) {
        this.testResults.push({
          test: 'rate_limiting',
          input: testCase.requests,
          expected: testCase.expected,
          actual: false,
          passed: false,
          error: error.message
        });
      }
    }
  }
  
  // Test error handling
  async testErrorHandling() {
    const testCases = [
      { error: 'Database connection failed: password=secret123', expected: 'password=***' },
      { error: 'Token expired: token=abc123', expected: 'token=***' },
      { error: 'Normal error message', expected: 'Normal error message' }
    ];
    
    for (const testCase of testCases) {
      try {
        const sanitized = this.sanitizeErrorMessage(testCase.error);
        const passed = sanitized.includes(testCase.expected);
        
        this.testResults.push({
          test: 'error_handling',
          input: testCase.error,
          expected: testCase.expected,
          actual: sanitized,
          passed
        });
      } catch (error) {
        this.testResults.push({
          test: 'error_handling',
          input: testCase.error,
          expected: testCase.expected,
          actual: null,
          passed: false,
          error: error.message
        });
      }
    }
  }
  
  // Helper methods (simplified implementations)
  validateUrn(urn) {
    const urnRegex = /^urn:agent:[a-zA-Z0-9-]+:[a-zA-Z0-9-]+(@[0-9]+\.[0-9]+\.[0-9]+)?$/;
    return urnRegex.test(urn);
  }
  
  sanitizeInput(input) {
    return input.replace(/<script[^>]*>.*?<\/script>/gi, '')
                .replace(/['"]/g, '')
                .replace(/[\n\r\t]/g, '');
  }
  
  async validateToken(token) {
    // Simplified token validation
    return token === 'valid-token';
  }
  
  async checkAuthorization(user, resource) {
    // Simplified authorization check
    if (user === 'admin') return true;
    if (user === 'user' && resource === '/user') return true;
    return false;
  }
  
  async testRateLimit(requests) {
    // Simplified rate limit test
    return requests <= 50;
  }
  
  sanitizeErrorMessage(message) {
    return message.replace(/password[=:]\s*\S+/gi, 'password=***')
                  .replace(/token[=:]\s*\S+/gi, 'token=***');
  }
  
  // Get test results summary
  getTestSummary() {
    const total = this.testResults.length;
    const passed = this.testResults.filter(r => r.passed).length;
    const failed = total - passed;
    
    return {
      total,
      passed,
      failed,
      successRate: total > 0 ? passed / total : 0,
      results: this.testResults
    };
  }
}

// Usage
const securityTesting = new SecurityTesting();
await securityTesting.initialize();

// Run security tests
const results = await securityTesting.runSecurityTests();

// Get test summary
const summary = securityTesting.getTestSummary();
console.log('Security test summary:', summary);
```

## Best Practices Summary

### 1. Authentication and Authorization
- Use strong authentication mechanisms (bearer tokens, certificates)
- Implement role-based access control
- Validate URNs and permissions
- Use secure token storage and rotation

### 2. Data Protection
- Encrypt sensitive data in transit and at rest
- Implement data sanitization and validation
- Use secure key management
- Implement data retention policies

### 3. Network Security
- Use TLS for all communications
- Implement certificate validation
- Use secure protocols and ciphers
- Implement network segmentation

### 4. Input Validation
- Validate all inputs and URNs
- Sanitize user-provided data
- Implement rate limiting
- Use parameterized queries

### 5. Error Handling
- Sanitize error messages
- Avoid information leakage
- Implement secure logging
- Use structured error responses

### 6. Logging and Monitoring
- Log security events
- Monitor for suspicious activity
- Implement alerting
- Use structured logging

### 7. Security Testing
- Implement security test suites
- Test authentication and authorization
- Validate input sanitization
- Test error handling

### 8. Incident Response
- Implement security incident procedures
- Monitor for security breaches
- Have response plans ready
- Document security incidents

This security guide provides comprehensive best practices and examples for securing the Semantext Hub runtime components against common security threats and vulnerabilities.
