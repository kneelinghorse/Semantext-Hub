import rateLimit from 'express-rate-limit';

/**
 * Create a rate limiting middleware instance to prevent abuse
 * Configured for 100 requests per minute per IP by default
 */
export function createRateLimiter(overrides = {}) {
  return rateLimit({
    windowMs: 60 * 1000,      // 1 minute
    max: 100,                  // 100 requests per minute
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,     // Return rate limit info in RateLimit-* headers
    legacyHeaders: false,      // Disable X-RateLimit-* headers
    ...overrides,
  });
}
