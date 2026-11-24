import { formatDecimal } from '../src/index';

describe('formatDecimal', () => {
  it.each([
    [400, undefined, '400'],
    [40.5, undefined, '40.5'],
    [401.12345, undefined, '401.123'],
    [100.1, undefined, '100.1'],
    [-160.0004, undefined, '-160'],
    [-0.0001, undefined, '0'],
    [2.56789, 1, '2.6'],
    [2.5, 0, '3'],
  ])('formats %s with %s decimals as %s', (value, maxDecimals, expected) => {
    expect(formatDecimal(value, maxDecimals)).toBe(expected);
  });
});
