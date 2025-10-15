import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSemanticPanel, manifestSemanticAttrs } from './useSemanticPanel.js';

describe('useSemanticPanel', () => {
  it('returns empty object when no URN provided', () => {
    const { result } = renderHook(() => useSemanticPanel(null));
    expect(result.current).toEqual({});
  });

  it('returns basic semantic attributes', () => {
    const { result } = renderHook(() =>
      useSemanticPanel('urn:proto:test:123', { type: 'manifest' })
    );

    expect(result.current).toEqual({
      'data-semantic-urn': 'urn:proto:test:123',
      'data-semantic-type': 'manifest',
    });
  });

  it('includes version when provided', () => {
    const { result } = renderHook(() =>
      useSemanticPanel('urn:proto:test:123', {
        type: 'manifest',
        version: '1.0.0',
      })
    );

    expect(result.current['data-semantic-version']).toBe('1.0.0');
  });

  it('includes context when provided', () => {
    const context = { status: 'active' };
    const { result } = renderHook(() =>
      useSemanticPanel('urn:proto:test:123', {
        type: 'manifest',
        context,
      })
    );

    expect(result.current['data-semantic-context']).toBe(
      JSON.stringify(context)
    );
  });

  it('memoizes result', () => {
    const { result, rerender } = renderHook(
      ({ urn, metadata }) => useSemanticPanel(urn, metadata),
      {
        initialProps: {
          urn: 'urn:proto:test:123',
          metadata: { type: 'manifest' },
        },
      }
    );

    const firstResult = result.current;
    rerender({
      urn: 'urn:proto:test:123',
      metadata: { type: 'manifest' },
    });

    expect(result.current).toBe(firstResult);
  });
});

describe('manifestSemanticAttrs', () => {
  it('returns empty object for invalid manifest', () => {
    expect(manifestSemanticAttrs(null)).toEqual({});
    expect(manifestSemanticAttrs({})).toEqual({});
  });

  it('generates attributes for valid manifest', () => {
    const manifest = {
      id: 'api-test',
      format: 'openapi',
      path: '/path/to/manifest.json',
    };

    const attrs = manifestSemanticAttrs(manifest);

    expect(attrs).toEqual({
      'data-semantic-urn': 'urn:proto:manifest:api-test',
      'data-semantic-type': 'manifest',
      'data-semantic-format': 'openapi',
      'data-semantic-path': '/path/to/manifest.json',
    });
  });

  it('supports optional semantic metadata overrides', () => {
    const manifest = {
      id: 'api-test',
      format: 'openapi',
      path: '/path/to/manifest.json',
    };

    const attrs = manifestSemanticAttrs(manifest, {
      view: 'detail',
      role: 'manifest-detail',
      state: 'ready',
      context: { filename: 'api-test.json' },
    });

    expect(attrs['data-semantic-view']).toBe('detail');
    expect(attrs['data-semantic-role']).toBe('manifest-detail');
    expect(attrs['data-semantic-state']).toBe('ready');
    expect(attrs['data-semantic-context']).toBe(
      JSON.stringify({ filename: 'api-test.json' })
    );
  });
});
