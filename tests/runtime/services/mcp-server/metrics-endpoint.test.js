import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  MetricsEndpoint,
  createMetricsEndpoint
} from '../../../../packages/runtime/services/mcp-server/metrics-endpoint.js';

let endpoints;

function createEndpoint(options = {}) {
  const instance = new MetricsEndpoint(options);
  endpoints.push(instance);
  return instance;
}

function createResponseMocks() {
  return {
    writeHead: jest.fn(),
    end: jest.fn()
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  endpoints = [];
});

afterEach(() => {
  for (const endpoint of endpoints) {
    endpoint.destroy();
  }
  endpoints = [];
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('MetricsEndpoint HTTP handling', () => {
  test('serves metrics JSON when request matches path', () => {
    const logger = { debug: jest.fn(), error: jest.fn() };
    const endpoint = createEndpoint({ logger, metricsPath: '/metrics' });

    endpoint.recordRequest('toolA', 'discovery', 120, true, true);

    const response = createResponseMocks();
    endpoint.handleRequest({ url: '/metrics' }, response);

    expect(response.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        'Content-Type': 'application/json'
      })
    );

    const payload = JSON.parse(response.end.mock.calls[0][0]);

    expect(payload.server.requests.total).toBe(1);
    expect(payload.cache.hitRatio).toBe(0);
    expect(logger.debug).toHaveBeenCalledWith('Served metrics', {
      totalRequests: 1
    });
  });

  test('returns 404 JSON when path does not match', () => {
    const endpoint = createEndpoint({ enableLogging: false });
    const response = createResponseMocks();

    endpoint.handleRequest({ url: '/unknown' }, response);

    expect(response.writeHead).toHaveBeenCalledWith(
      404,
      expect.objectContaining({ 'Content-Type': 'application/json' })
    );
    expect(JSON.parse(response.end.mock.calls[0][0])).toEqual({
      error: 'Not found'
    });
  });

  test('handles errors during metrics serving', () => {
    const logger = { debug: jest.fn(), error: jest.fn() };
    const endpoint = createEndpoint({ logger });
    const response = createResponseMocks();

    endpoint.getMetrics = () => {
      throw new Error('boom');
    };

    endpoint.handleRequest({ url: '/metrics' }, response);

    expect(response.writeHead).toHaveBeenCalledWith(
      500,
      expect.objectContaining({ 'Content-Type': 'application/json' })
    );
    expect(JSON.parse(response.end.mock.calls[0][0])).toEqual({
      error: 'Internal server error'
    });
    expect(logger.error).toHaveBeenCalledWith('Error serving metrics', {
      error: expect.any(Error)
    });
  });
});

describe('Metrics tracking', () => {
  test('records requests, cache hits, and maintains percentiles', () => {
    jest.setSystemTime(10_000);
    const endpoint = createEndpoint({ enableLogging: false });

    endpoint.metrics.server.performance.latency.samples = new Array(1000).fill(5);
    endpoint.metrics.discovery.latency.samples = new Array(1000).fill(10);
    endpoint.metrics.mcp.latency.samples = new Array(1000).fill(20);
    endpoint.metrics.a2a.latency.samples = new Array(1000).fill(30);
    endpoint.requestTimes = Array.from({ length: 1000 }, (_, i) => i);

    endpoint.recordRequest('toolA', 'discovery', 120, true, true);
    endpoint.recordRequest('toolB', 'mcp', 300, false, false);
    endpoint.recordRequest('toolF', 'discovery', 210, false, false);
    endpoint.recordRequest('toolB', 'mcp', 250, true, true);
    endpoint.recordRequest('toolC', 'a2a', 90, true, false);
    endpoint.recordRequest('toolD', 'a2a', 110, false, false);
    endpoint.recordRequest('toolA', 'custom', 60, true, false);
    endpoint.recordCache('key1', false);
    endpoint.recordCache('key1', true);
    endpoint.recordCache('key2', true);

    expect(endpoint.metrics.server.requests.total).toBe(7);
    expect(endpoint.metrics.server.requests.successful).toBe(4);
    expect(endpoint.metrics.server.requests.failed).toBe(3);

    expect(endpoint.metrics.server.requests.byTool.get('toolA')).toEqual({
      total: 2,
      successful: 2,
      failed: 0
    });
    expect(endpoint.metrics.server.requests.byTool.get('toolB')).toEqual({
      total: 2,
      successful: 1,
      failed: 1
    });
    expect(endpoint.metrics.server.requests.byOperation.get('mcp')).toEqual({
      total: 2,
      successful: 1,
      failed: 1
    });

    expect(endpoint.metrics.discovery.cached).toBe(1);
    expect(endpoint.metrics.discovery.failed).toBe(1);
    expect(endpoint.metrics.mcp.cached).toBe(1);
    expect(endpoint.metrics.mcp.failed).toBe(1);
    expect(endpoint.metrics.a2a.successful).toBe(1);
    expect(endpoint.metrics.a2a.failed).toBe(1);
    expect(endpoint.metrics.cache.byKey.get('key1')).toEqual({ hits: 1, misses: 1 });
    expect(endpoint.metrics.cache.hitRatio).toBeCloseTo(2 / 3);

    expect(endpoint.metrics.server.performance.latency.samples.length).toBe(1000);
    expect(endpoint.metrics.discovery.latency.samples.length).toBe(1000);
    expect(endpoint.metrics.mcp.latency.samples.length).toBe(1000);
    expect(endpoint.metrics.a2a.latency.samples.length).toBe(1000);

    endpoint.updatePercentiles({ samples: [] });

    endpoint.metrics.server.uptime = 4000;
    endpoint.requestTimes = [
      Date.now() - 500,
      Date.now() - 1500
    ];
    endpoint.updateThroughput();

    expect(endpoint.metrics.server.performance.throughput.requestsPerSecond).toBe(1);
    expect(endpoint.metrics.server.performance.throughput.peakRPS).toBe(1);
    expect(endpoint.metrics.server.performance.throughput.averageRPS).toBeCloseTo(1.75);

    const metrics = endpoint.getMetrics();
    expect(metrics.server.requests.byTool.toolA.total).toBe(2);
    expect(metrics.discovery.cacheRatio).toBeCloseTo(0.5);
    expect(metrics.mcp.failed).toBe(1);
    expect(metrics.a2a.successRate).toBeCloseTo(0.5);

    const summary = endpoint.getSummary();
    expect(summary.requests.total).toBe(7);
    expect(summary.latency.p99).toBe(metrics.server.performance.latency.p99);
  });

  test('updates memory metrics and emits warnings', () => {
    const endpoint = createEndpoint({ enableLogging: false });
    const warningListener = jest.fn();
    endpoint.on('memoryWarning', warningListener);

    jest.spyOn(Date, 'now').mockReturnValue(4000);
    endpoint.metrics.server.startTime = 1000;

    jest.spyOn(process, 'memoryUsage').mockReturnValue({
      heapUsed: 200 * 1024 * 1024,
      heapTotal: 300 * 1024 * 1024,
      external: 10,
      rss: 20
    });

    endpoint.updateMetrics();

    expect(warningListener).toHaveBeenCalledWith(
      expect.objectContaining({
        heapUsed: 200 * 1024 * 1024,
        heapTotal: 300 * 1024 * 1024
      })
    );
    expect(endpoint.metrics.memory.heapUsedMB).toBeCloseTo(200);
    expect(endpoint.metrics.server.uptime).toBe(3000);
  });

  test('getMetrics reports zeroed ratios before any activity', () => {
    const endpoint = createEndpoint({ enableLogging: false });
    const metrics = endpoint.getMetrics();
    expect(metrics.server.requests.total).toBe(0);
    expect(metrics.server.requests.successRate).toBe(0);
    expect(metrics.discovery.cacheRatio).toBe(0);
    expect(metrics.mcp.cacheRatio).toBe(0);
    expect(metrics.a2a.successRate).toBe(0);

    const summary = endpoint.getSummary();
    expect(summary.requests.total).toBe(0);
    expect(summary.cache.hitRatio).toBe(0);
  });

  test('reset clears collected metrics', () => {
    const endpoint = createEndpoint({ enableLogging: false });

    endpoint.recordRequest('toolA', 'discovery', 50, true, false);
    endpoint.recordCache('key1', true);

    endpoint.reset();

    expect(endpoint.metrics.server.requests.total).toBe(0);
    expect(endpoint.metrics.server.requests.byTool.size).toBe(0);
    expect(endpoint.metrics.cache.byKey.size).toBe(0);
    expect(endpoint.requestTimes).toEqual([]);
  });
});

describe('Lifecycle helpers', () => {
  test('destroy clears scheduled intervals', () => {
    const clearSpy = jest.spyOn(global, 'clearInterval');
    const endpoint = createEndpoint();
    endpoint.destroy();
    expect(clearSpy).toHaveBeenCalledWith(endpoint.updateInterval);
    expect(clearSpy).toHaveBeenCalledWith(endpoint.throughputInterval);
  });

  test('factory creates endpoint instance', () => {
    const endpoint = createMetricsEndpoint({ enableLogging: false });
    endpoint.destroy();
    expect(endpoint).toBeInstanceOf(MetricsEndpoint);
  });
});
