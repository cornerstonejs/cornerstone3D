import { utilities } from '../src/index';

const { toFiniteNumber } = utilities;

describe('toFiniteNumber without a default value', () => {
  it('converts a finite value', () => {
    expect(toFiniteNumber('3')).toBe(3);
  });

  it('answers undefined for an absent value', () => {
    expect(toFiniteNumber(undefined)).toBeUndefined();
  });

  it('answers undefined for a non-finite value', () => {
    expect(toFiniteNumber('abc')).toBeUndefined();
    expect(toFiniteNumber(Infinity)).toBeUndefined();
  });

  it('answers undefined for each non-finite entry of an array', () => {
    expect(toFiniteNumber(['1', 'abc', '3'])).toEqual([1, undefined, 3]);
  });

  // `Array.from(null)` threw, and `Array.from(true)` answered `[]`. Neither is
  // an answer a caller can use, and a metadata value of `null` reaches this.
  it('answers undefined for a value it cannot convert', () => {
    expect(toFiniteNumber(null)).toBeUndefined();
    expect(toFiniteNumber(true)).toBeUndefined();
    expect(toFiniteNumber({})).toBeUndefined();
  });

  it('still converts an array-like value entry by entry', () => {
    expect(toFiniteNumber(new Float32Array([1, 2]))).toEqual([1, 2]);
    expect(toFiniteNumber({ length: 2, 0: '4', 1: '5' })).toEqual([4, 5]);
  });
});

describe('toFiniteNumber with a default value', () => {
  it('converts a finite value and ignores the default value', () => {
    expect(toFiniteNumber('3', 0)).toBe(3);
    expect(toFiniteNumber(0, 7)).toBe(0);
  });

  it('answers the default value for an absent value', () => {
    expect(toFiniteNumber(undefined, 0)).toBe(0);
  });

  it('answers the default value for a non-finite value', () => {
    expect(toFiniteNumber('abc', 0)).toBe(0);
    expect(toFiniteNumber(Infinity, 0)).toBe(0);
    expect(toFiniteNumber(NaN, 0)).toBe(0);
  });

  it('answers the default value for each non-finite entry of an array', () => {
    expect(toFiniteNumber(['1', 'abc', '3'], 0)).toEqual([1, 0, 3]);
  });

  it('answers the default value for a value it cannot convert', () => {
    expect(toFiniteNumber(null, 0)).toBe(0);
    expect(toFiniteNumber(true, 0)).toBe(0);
    expect(toFiniteNumber({}, 0)).toBe(0);
  });
});
