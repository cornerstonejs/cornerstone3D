import { deepMerge } from '../../src/utilities';
import { describe, it, expect } from '@jest/globals';

describe('deepMerge', () => {
  it('overrides array values that also appear elsewhere in the target', () => {
    const target = { colors: { SAGITTAL: [1, 1, 0] } };
    const source = { colors: { SAGITTAL: [0, 1, 1] } };

    expect(deepMerge(target, source).colors.SAGITTAL).toEqual([0, 1, 1]);
  });

  it('applies a reordered array', () => {
    expect(deepMerge({ order: [1, 2, 3] }, { order: [3, 1, 2] })).toEqual({
      order: [3, 1, 2],
    });
    expect(deepMerge(['a', 'b'], ['b', 'a'])).toEqual(['b', 'a']);
  });

  it('keeps target elements beyond the end of the source array', () => {
    expect(deepMerge({ list: [1, 2, 3] }, { list: [4] })).toEqual({
      list: [4, 2, 3],
    });
  });

  it('still merges objects inside arrays', () => {
    expect(
      deepMerge({ items: [{ a: 1, b: 2 }] }, { items: [{ b: 3 }] })
    ).toEqual({ items: [{ a: 1, b: 3 }] });
  });

  it('does not mutate the caller arrays', () => {
    const target = { values: [1, 0] };
    const source = { values: [0, 1] };

    deepMerge(target, source);

    expect(target.values).toEqual([1, 0]);
    expect(source.values).toEqual([0, 1]);
  });
});
