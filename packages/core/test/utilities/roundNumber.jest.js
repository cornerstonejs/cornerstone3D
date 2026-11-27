import { roundNumber, roundNumberTrim } from '../../src/utilities';
import { describe, it, expect } from '@jest/globals';

describe('roundNumber', function () {
  it('Should correctly round negative values', () => {
    expect(roundNumber(-1)).toBe('-1.00');
    expect(roundNumber(-1.23456789)).toBe('-1.23');
  });

  it('Should correctly round positive values', () => {
    expect(roundNumber(1)).toBe('1.00');
    expect(roundNumber(1.23456789)).toBe('1.23');
    expect(roundNumber(12.3456789)).toBe('12.3');
    expect(roundNumber(123.456789)).toBe('123');
    expect(roundNumber(0.123456789)).toBe('0.123');
  });
});

describe('roundNumberTrim', function () {
  it('Should drop trailing zeros and a bare decimal point', () => {
    expect(roundNumberTrim(1)).toBe('1');
    expect(roundNumberTrim(-1)).toBe('-1');
    expect(roundNumberTrim(12.3)).toBe('12.3');
    expect(roundNumberTrim(400, 5)).toBe('400');
    expect(roundNumberTrim(40.5, 5)).toBe('40.5');
    expect(roundNumberTrim(401.12345, 5)).toBe('401.123');
    expect(roundNumberTrim([1, 2.5])).toBe('1, 2.5');
    // The exponent of a very large value stays.
    expect(roundNumberTrim(1.2e30)).toBe('1.2e+30');
  });
});
