import { describe, expect, test } from '@jest/globals';

import {
  canonicalize,
  canonicalizeToBuffer,
} from '../../app/libs/signing/jcs.mjs';

describe('RFC8785 JCS canonicalization helpers', () => {
  test('orders object keys, skips undefined fields, and canonicalizes arrays', () => {
    const input = {
      z: 'last',
      a: undefined,
      b: 1,
      nested: [
        2,
        {
          z: 'later',
          a: 'first',
          extra: undefined,
        },
      ],
    };

    const canonical = canonicalize(input);
    expect(canonical).toBe('{"b":1,"nested":[2,{"a":"first","z":"later"}],"z":"last"}');
  });

  test('throws informative errors for unsupported or non-finite values', () => {
    expect(() => canonicalize(undefined)).toThrow(
      /Unsupported type for canonicalization/i,
    );
    expect(() => canonicalize(Number.POSITIVE_INFINITY)).toThrow(
      /Non-finite numbers cannot be canonicalized/i,
    );
  });

  test('supports bigint inputs via canonicalizeToBuffer', () => {
    const buffer = canonicalizeToBuffer(10n);
    expect(buffer.toString('utf8')).toBe('10');
  });
});
