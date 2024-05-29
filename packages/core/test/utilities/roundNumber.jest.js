import { roundNumber } from '../../src/utilities/index.js';
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
