import { asMultiValueArray } from '../src';
import { describe, it, expect } from '@jest/globals';

describe('asMultiValueArray', () => {
  it('gives the same values for a string, a list and a one-item backslash-joined list', () => {
    const expected = ['DECY', 'ATTN', 'SCAT'];
    expect(asMultiValueArray('DECY\\ATTN\\SCAT')).toEqual(expected);
    expect(asMultiValueArray(['DECY\\ATTN\\SCAT'])).toEqual(expected);
    expect(asMultiValueArray(['DECY', 'ATTN', 'SCAT'])).toEqual(expected);
  });

  it('gives an empty list for undefined and null, and keeps non-string items', () => {
    expect(asMultiValueArray(undefined)).toEqual([]);
    expect(asMultiValueArray(null)).toEqual([]);
    expect(asMultiValueArray([1.5, 'A\\B', 2])).toEqual([1.5, 'A', 'B', 2]);
  });

  it('gives [""] for an empty string, and wraps an object input', () => {
    expect(asMultiValueArray('')).toEqual(['']);
    // A present tag with no Value, as wadors getTagValue(tag, false) gives it.
    expect(asMultiValueArray({ vr: 'CS' })).toEqual([{ vr: 'CS' }]);
  });
});
