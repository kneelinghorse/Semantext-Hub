// ESM probe sample test (TypeScript)
import { describe, it, expect } from '@jest/globals';
import { URL } from 'node:url';

describe('esm-sample', () => {
  it('imports as ESM and resolves URL', () => {
    const u = new URL('../fixtures', import.meta.url);
    expect(u).toBeTruthy();
    expect(typeof u.href).toBe('string');
  });
});

