import { utilities } from '@cornerstonejs/core';

describe('voiLUTFunction of createImage', () => {
  // The wadouri and wadors providers give VOILUTFunction (0028,1056) as a
  // string. `[0]` of that string gave 'S', and the viewport used LINEAR.
  it('reads a string or an array as one value', () => {
    expect(utilities.asArrayFirst('SIGMOID')).toBe('SIGMOID');
    expect(utilities.asArrayFirst(['SIGMOID'])).toBe('SIGMOID');
  });
});
