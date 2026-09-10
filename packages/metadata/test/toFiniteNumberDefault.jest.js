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
});
