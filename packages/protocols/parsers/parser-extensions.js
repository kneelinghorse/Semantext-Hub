/**
 * Parser Extensions (B7.1.1)
 * Facade utilities for circular detection, external $ref resolution,
 * RFC 7807 error formatting, and simplified progress emission.
 */

import { CircularRefDetector } from './utils/circular-ref-detector.js';
import { ExternalRefResolver } from './utils/external-ref-resolver.js';
import { getErrorMeta } from './utils/error-codes.js';
import { EventEmitter } from 'eventemitter3';

class ParserExtensions {
  constructor(options = {}) {
    this.options = {
      allowCircular: options.allowCircular || false,
      maxRefDepth: options.maxRefDepth || 50,
      refTimeout: options.refTimeout || 5000,
      basePath: options.basePath || process.cwd(),
      baseUrl: options.baseUrl || null,
      ...options
    };

    this._detector = new CircularRefDetector({
      allowCircular: this.options.allowCircular,
      maxDepth: this.options.maxRefDepth
    });

    this._resolver = new ExternalRefResolver({
      timeout: this.options.refTimeout,
      basePath: this.options.basePath,
      baseUrl: this.options.baseUrl
    });

    // Simple progress emitter that throttles to 10% increments
    this.progress = new EventEmitter();
    this._lastProgressBucket = -10; // ensures 0% emits
  }

  // Circular reference detection
  detectCircularRefs(spec, externalRefs = new Map()) {
    return this._detector.detectCircular(spec, externalRefs);
  }

  // External $ref resolution with timeout
  async resolveExternalRefs(spec, options = {}) {
    const refUris = this._extractExternalRefUris(spec);
    const results = new Map();
    const total = refUris.length;
    let resolved = 0;

    for (const uri of refUris) {
      try {
        const res = await this._resolver.resolveExternal(uri, options);
        results.set(uri, res);
        resolved += 1;
      } catch (err) {
        // Surface resolution errors to caller; leave partial results
        throw err;
      } finally {
        const percent = total === 0 ? 100 : Math.floor((resolved / total) * 100);
        this.emitProgress('resolving_external_refs', percent, { resolved, total });
      }
    }

    return results;
  }

  // Structured error formatting (RFC 7807 Problem Details)
  // formatError(code, message?, details?)
  formatError(code, message = null, details = {}) {
    const meta = getErrorMeta(code);
    const title = message || meta.message || 'Parser error';
    const status = this._inferHttpStatus(code, meta);
    const instance = details.instance || details.path || undefined;

    const problem = {
      type: `https://docs/errors/${code}`,
      title,
      status,
      detail: details.detail || title,
      ...(instance && { instance }),
      code,
      severity: meta.severity,
      recoverable: meta.recoverable,
      ...(meta.suggestion && { suggestion: meta.suggestion }),
      ...(details.metadata && { metadata: details.metadata })
    };

    return problem;
  }

  // Progress event emitter (every 10%)
  emitProgress(stage, percent, metadata = {}) {
    const safe = Math.max(0, Math.min(100, Math.floor(percent)));
    const bucket = Math.floor(safe / 10) * 10; // 0,10,...100
    if (bucket > this._lastProgressBucket || (bucket === 100 && this._lastProgressBucket !== 100)) {
      this._lastProgressBucket = bucket;
      this.progress.emit('progress', {
        stage,
        percent: bucket,
        metadata,
        timestamp: new Date().toISOString()
      });
    }
  }

  // =============== Private helpers ===============
  _extractExternalRefUris(obj, refs = [], visited = new Set()) {
    if (!obj || typeof obj !== 'object' || visited.has(obj)) return refs;
    visited.add(obj);

    if (obj.$ref && typeof obj.$ref === 'string') {
      const ref = obj.$ref;
      if (/^(https?|file):\/\//i.test(ref)) refs.push(ref);
    }

    if (Array.isArray(obj)) {
      for (const item of obj) this._extractExternalRefUris(item, refs, visited);
    } else {
      for (const value of Object.values(obj)) this._extractExternalRefUris(value, refs, visited);
    }

    // dedupe
    return [...new Set(refs)];
  }

  _inferHttpStatus(code, meta) {
    // Domain-based mapping with specific overrides
    if (/^NET_/.test(code)) {
      if (code === 'NET_001') return 504; // timeout
      if (code === 'NET_002') return 502; // connection refused
      if (code === 'NET_003') return 502; // TLS/SSL errors
      if (code === 'NET_004') return 502; // upstream HTTP error
      if (code === 'NET_005') return 502; // DNS failed
      if (code === 'NET_006') return 508; // loop/redirects
      return 502;
    }
    if (/^REF_/.test(code)) {
      if (code === 'REF_004') return 404; // target not found
      if (code === 'REF_002') return 409; // circular
      if (code === 'REF_003') return 400; // invalid URI
      if (code === 'REF_007') return 504; // external timeout
      return 424; // failed dependency
    }
    if (/^OPENAPI_/.test(code)) return 400;
    if (/^SCHEMA_/.test(code)) return 422;
    if (/^PARSE_/.test(code)) return 400;
    return meta.severity === 'ERROR' ? 500 : 400;
  }
}

export { ParserExtensions };

