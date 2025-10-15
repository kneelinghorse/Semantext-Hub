#!/usr/bin/env node

/**
 * Security Example
 * 
 * This example demonstrates security best practices including:
 * - Authentication and authorization
 * - Input validation and sanitization
 * - Secure communication
 * - Error handling without information leakage
 * - Logging security events
 * - Rate limiting
 * - CORS configuration
 */

import { createStructuredLogger, LOG_LEVELS } from '../../runtime/structured-logger.js';

async function securityExample() {
  console.log('=== Security Example ===\n');
  
  // Initialize security components
  console.log('1. Initializing security components...');
  
  const logger = createStructuredLogger({
    level: LOG_LEVELS.INFO,
    enableConsole: true,
    enableMetrics: true
  });
  
  console.log('✓ Security components initialized\n');
  
  // Authentication demonstration
  console.log('2. Authentication demonstration...');
  
  class AuthenticationService {
    constructor() {
      this.users = new Map();
      this.sessions = new Map();
      this.failedAttempts = new Map();
      this.maxFailedAttempts = 3;
      this.lockoutDuration = 300000; // 5 minutes
    }
    
    async authenticate(username, password) {
      const user = this.users.get(username);
      
      if (!user) {
        this.recordFailedAttempt(username);
        throw new Error('Invalid credentials');
      }
      
      // Check if account is locked
      if (this.isAccountLocked(username)) {
        throw new Error('Account temporarily locked due to too many failed attempts');
      }
      
      // Verify password (in real implementation, use bcrypt or similar)
      if (user.password !== password) {
        this.recordFailedAttempt(username);
        throw new Error('Invalid credentials');
      }
      
      // Clear failed attempts on successful login
      this.failedAttempts.delete(username);
      
      // Create session
      const sessionId = this.generateSessionId();
      const session = {
        userId: user.id,
        username: user.username,
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000, // 1 hour
        ipAddress: '192.168.1.100', // In real implementation, get from request
        userAgent: 'Mozilla/5.0...' // In real implementation, get from request
      };
      
      this.sessions.set(sessionId, session);
      
      // Log successful authentication
      logger.info('User authenticated successfully', {
        component: 'AuthenticationService',
        operation: 'authenticate',
        userId: user.id,
        username: user.username,
        sessionId: sessionId,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent
      });
      
      return { sessionId, user: { id: user.id, username: user.username } };
    }
    
    async validateSession(sessionId) {
      const session = this.sessions.get(sessionId);
      
      if (!session) {
        throw new Error('Invalid session');
      }
      
      if (Date.now() > session.expiresAt) {
        this.sessions.delete(sessionId);
        throw new Error('Session expired');
      }
      
      return session;
    }
    
    async logout(sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        this.sessions.delete(sessionId);
        
        logger.info('User logged out', {
          component: 'AuthenticationService',
          operation: 'logout',
          userId: session.userId,
          username: session.username,
          sessionId: sessionId
        });
      }
    }
    
    recordFailedAttempt(username) {
      const attempts = this.failedAttempts.get(username) || [];
      attempts.push(Date.now());
      
      // Keep only recent attempts within lockout duration
      const recentAttempts = attempts.filter(time => Date.now() - time < this.lockoutDuration);
      this.failedAttempts.set(username, recentAttempts);
      
      // Log failed attempt
      logger.warn('Authentication failed', {
        component: 'AuthenticationService',
        operation: 'authenticate',
        username: username,
        attemptCount: recentAttempts.length,
        ipAddress: '192.168.1.100'
      });
    }
    
    isAccountLocked(username) {
      const attempts = this.failedAttempts.get(username) || [];
      return attempts.length >= this.maxFailedAttempts;
    }
    
    generateSessionId() {
      return 'sess_' + Math.random().toString(36).substr(2, 9);
    }
    
    addUser(username, password) {
      this.users.set(username, {
        id: 'user_' + Math.random().toString(36).substr(2, 9),
        username,
        password // In real implementation, hash the password
      });
    }
  }
  
  const authService = new AuthenticationService();
  
  // Add test user
  authService.addUser('testuser', 'password123');
  
  // Test authentication
  try {
    const result = await authService.authenticate('testuser', 'password123');
    console.log('✓ Authentication successful');
    console.log(`  Session ID: ${result.sessionId}`);
    console.log(`  User ID: ${result.user.id}`);
    
    // Validate session
    const session = await authService.validateSession(result.sessionId);
    console.log('✓ Session validation successful');
    console.log(`  Username: ${session.username}`);
    console.log(`  Expires at: ${new Date(session.expiresAt).toISOString()}`);
    
    // Logout
    await authService.logout(result.sessionId);
    console.log('✓ Logout successful');
    
  } catch (error) {
    console.log('⚠ Authentication failed:', error.message);
  }
  
  // Test failed authentication
  try {
    await authService.authenticate('testuser', 'wrongpassword');
  } catch (error) {
    console.log('✓ Failed authentication handled correctly');
  }
  
  console.log('');
  
  // Input validation demonstration
  console.log('3. Input validation demonstration...');
  
  class InputValidator {
    static validateEmail(email) {
      if (!email || typeof email !== 'string') {
        throw new Error('Email is required');
      }
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Invalid email format');
      }
      
      if (email.length > 254) {
        throw new Error('Email too long');
      }
      
      return email.toLowerCase().trim();
    }
    
    static validatePassword(password) {
      if (!password || typeof password !== 'string') {
        throw new Error('Password is required');
      }
      
      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }
      
      if (password.length > 128) {
        throw new Error('Password too long');
      }
      
      // Check for common weak passwords
      const weakPasswords = ['password', '123456', 'qwerty', 'abc123'];
      if (weakPasswords.includes(password.toLowerCase())) {
        throw new Error('Password is too weak');
      }
      
      return password;
    }
    
    static validateUsername(username) {
      if (!username || typeof username !== 'string') {
        throw new Error('Username is required');
      }
      
      if (username.length < 3) {
        throw new Error('Username must be at least 3 characters long');
      }
      
      if (username.length > 30) {
        throw new Error('Username too long');
      }
      
      const usernameRegex = /^[a-zA-Z0-9_-]+$/;
      if (!usernameRegex.test(username)) {
        throw new Error('Username contains invalid characters');
      }
      
      return username.toLowerCase().trim();
    }
    
    static sanitizeInput(input) {
      if (typeof input !== 'string') {
        return input;
      }
      
      // Remove potentially dangerous characters
      return input
        .replace(/[<>\"'&]/g, '') // Remove HTML/XML characters
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+\s*=/gi, '') // Remove event handlers
        .trim();
    }
  }
  
  // Test input validation
  const testInputs = [
    { type: 'email', value: 'user@example.com' },
    { type: 'email', value: 'invalid-email' },
    { type: 'password', value: 'strongpassword123' },
    { type: 'password', value: 'weak' },
    { type: 'username', value: 'validuser' },
    { type: 'username', value: 'user@name' }
  ];
  
  testInputs.forEach(({ type, value }) => {
    try {
      let result;
      switch (type) {
        case 'email':
          result = InputValidator.validateEmail(value);
          break;
        case 'password':
          result = InputValidator.validatePassword(value);
          break;
        case 'username':
          result = InputValidator.validateUsername(value);
          break;
      }
      
      console.log(`✓ ${type} validation passed: ${result}`);
    } catch (error) {
      console.log(`⚠ ${type} validation failed: ${error.message}`);
    }
  });
  
  // Test input sanitization
  const maliciousInputs = [
    '<script>alert("xss")</script>',
    'javascript:alert("xss")',
    'onclick="alert(\'xss\')"',
    'Normal text with <tags>'
  ];
  
  maliciousInputs.forEach(input => {
    const sanitized = InputValidator.sanitizeInput(input);
    console.log(`✓ Input sanitized: "${input}" -> "${sanitized}"`);
  });
  
  console.log('');
  
  // Rate limiting demonstration
  console.log('4. Rate limiting demonstration...');
  
  class RateLimiter {
    constructor(maxRequests = 100, windowMs = 60000) {
      this.maxRequests = maxRequests;
      this.windowMs = windowMs;
      this.requests = new Map();
    }
    
    isAllowed(identifier) {
      const now = Date.now();
      const userRequests = this.requests.get(identifier) || [];
      
      // Remove old requests outside the window
      const recentRequests = userRequests.filter(time => now - time < this.windowMs);
      
      if (recentRequests.length >= this.maxRequests) {
        // Log rate limit exceeded
        logger.warn('Rate limit exceeded', {
          component: 'RateLimiter',
          operation: 'check',
          identifier: identifier,
          requestCount: recentRequests.length,
          maxRequests: this.maxRequests,
          windowMs: this.windowMs
        });
        
        return false;
      }
      
      // Add current request
      recentRequests.push(now);
      this.requests.set(identifier, recentRequests);
      
      return true;
    }
    
    getRemainingRequests(identifier) {
      const now = Date.now();
      const userRequests = this.requests.get(identifier) || [];
      const recentRequests = userRequests.filter(time => now - time < this.windowMs);
      
      return Math.max(0, this.maxRequests - recentRequests.length);
    }
  }
  
  const rateLimiter = new RateLimiter(5, 60000); // 5 requests per minute
  
  // Test rate limiting
  const testIdentifier = 'user-123';
  
  for (let i = 0; i < 7; i++) {
    const allowed = rateLimiter.isAllowed(testIdentifier);
    const remaining = rateLimiter.getRemainingRequests(testIdentifier);
    
    console.log(`  Request ${i + 1}: ${allowed ? 'Allowed' : 'Blocked'} (${remaining} remaining)`);
    
    if (!allowed) {
      break;
    }
  }
  
  console.log('✓ Rate limiting working correctly');
  console.log('');
  
  // CORS configuration demonstration
  console.log('5. CORS configuration demonstration...');
  
  class CORSConfig {
    constructor() {
      this.allowedOrigins = [
        'https://app.example.com',
        'https://admin.example.com'
      ];
      
      this.allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
      this.allowedHeaders = ['Content-Type', 'Authorization', 'X-Requested-With'];
      this.maxAge = 86400; // 24 hours
    }
    
    validateOrigin(origin) {
      if (!origin) {
        return false;
      }
      
      return this.allowedOrigins.includes(origin);
    }
    
    getCORSHeaders(origin) {
      const headers = {
        'Access-Control-Allow-Methods': this.allowedMethods.join(', '),
        'Access-Control-Allow-Headers': this.allowedHeaders.join(', '),
        'Access-Control-Max-Age': this.maxAge.toString()
      };
      
      if (this.validateOrigin(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
      } else {
        headers['Access-Control-Allow-Origin'] = '*';
      }
      
      return headers;
    }
  }
  
  const corsConfig = new CORSConfig();
  
  // Test CORS configuration
  const testOrigins = [
    'https://app.example.com',
    'https://malicious.com',
    null
  ];
  
  testOrigins.forEach(origin => {
    const headers = corsConfig.getCORSHeaders(origin);
    console.log(`✓ CORS headers for origin "${origin}":`);
    console.log(`  Access-Control-Allow-Origin: ${headers['Access-Control-Allow-Origin']}`);
    console.log(`  Access-Control-Allow-Credentials: ${headers['Access-Control-Allow-Credentials']}`);
  });
  
  console.log('');
  
  // Secure error handling demonstration
  console.log('6. Secure error handling demonstration...');
  
  class SecureErrorHandler {
    static handleError(error, context = {}) {
      // Log the full error details internally
      logger.error('Error occurred', {
        component: 'SecureErrorHandler',
        operation: 'handleError',
        error: error.message,
        stack: error.stack,
        context: context
      });
      
      // Return sanitized error to client
      if (error.name === 'ValidationError') {
        return {
          error: 'Validation failed',
          message: error.message,
          code: 'VALIDATION_ERROR'
        };
      }
      
      if (error.name === 'AuthenticationError') {
        return {
          error: 'Authentication failed',
          message: 'Invalid credentials',
          code: 'AUTH_ERROR'
        };
      }
      
      // Generic error for unknown errors
      return {
        error: 'Internal server error',
        message: 'An unexpected error occurred',
        code: 'INTERNAL_ERROR'
      };
    }
  }
  
  // Test secure error handling
  const testErrors = [
    new Error('Database connection failed'),
    new Error('Invalid input format'),
    new Error('User not found')
  ];
  
  testErrors.forEach(error => {
    const sanitizedError = SecureErrorHandler.handleError(error, {
      operation: 'test-operation',
      userId: 'user-123'
    });
    
    console.log(`✓ Error sanitized: ${error.message} -> ${sanitizedError.message}`);
  });
  
  console.log('');
  
  // Security logging demonstration
  console.log('7. Security logging demonstration...');
  
  // Log security events
  logger.info('Security event: User login', {
    component: 'SecurityService',
    operation: 'login',
    userId: 'user-123',
    username: 'testuser',
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0...',
    timestamp: new Date().toISOString()
  });
  
  logger.warn('Security event: Failed authentication', {
    component: 'SecurityService',
    operation: 'login',
    username: 'testuser',
    ipAddress: '192.168.1.100',
    attemptCount: 3,
    timestamp: new Date().toISOString()
  });
  
  logger.error('Security event: Suspicious activity detected', {
    component: 'SecurityService',
    operation: 'monitor',
    userId: 'user-123',
    activity: 'Multiple failed login attempts',
    ipAddress: '192.168.1.100',
    severity: 'high',
    timestamp: new Date().toISOString()
  });
  
  console.log('✓ Security events logged');
  console.log('');
  
  // Security recommendations
  console.log('8. Security recommendations...');
  
  console.log('✓ Security best practices:');
  console.log('  1. Always validate and sanitize user input');
  console.log('  2. Use strong authentication mechanisms');
  console.log('  3. Implement proper session management');
  console.log('  4. Use HTTPS for all communications');
  console.log('  5. Implement rate limiting');
  console.log('  6. Configure CORS properly');
  console.log('  7. Log security events for monitoring');
  console.log('  8. Handle errors securely without information leakage');
  console.log('  9. Use parameterized queries to prevent SQL injection');
  console.log('  10. Keep dependencies updated and patched');
  console.log('  11. Implement proper access controls');
  console.log('  12. Use environment variables for sensitive configuration');
  console.log('  13. Implement proper backup and recovery procedures');
  console.log('  14. Monitor for suspicious activities');
  console.log('  15. Regular security audits and penetration testing');
  console.log('');
  
  console.log('=== Example completed successfully ===');
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  securityExample().catch(error => {
    console.error('Example failed:', error);
    process.exit(1);
  });
}

export { securityExample };
