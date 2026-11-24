import { roundNumber } from '../../src/utilities';
import { describe, it, expect } from '@jest/globals';

describe('roundNumber', function () {
  it('Should correctly round negative values', () => {
    expect(roundNumber(-1)).toBe('-1');
    expect(roundNumber(-1.23456789)).toBe('-1.23');
  });

  it('Should correctly round positive values', () => {
    expect(roundNumber(1)).toBe('1');
    expect(roundNumber(1.23456789)).toBe('1.23');
    expect(roundNumber(12.3456789)).toBe('12.3');
    expect(roundNumber(123.456789)).toBe('123');
    expect(roundNumber(0.123456789)).toBe('0.123');
  });

  it('Should drop trailing zeros and a bare decimal point', () => {
    expect(roundNumber(12.3)).toBe('12.3');
    expect(roundNumber(400, 5)).toBe('400');
    expect(roundNumber(40.5, 5)).toBe('40.5');
    expect(roundNumber(401.12345, 5)).toBe('401.123');
    expect(roundNumber([1, 2.5])).toBe('1, 2.5');
  });
});
