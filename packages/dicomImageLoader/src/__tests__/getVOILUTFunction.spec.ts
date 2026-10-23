import getVOILUTFunction from '../imageLoader/getVOILUTFunction';

describe('getVOILUTFunction', () => {
  // The wadouri and wadors metadata providers give the single-valued
  // VOILUTFunction (0028,1056) as a string. Before the fix, `[0]` of that
  // string gave 'S', and the viewport then fell back to LINEAR.
  it('reads a string VOI LUT function as one value', () => {
    expect(getVOILUTFunction({ voiLUTFunction: 'SIGMOID' })).toBe('SIGMOID');
    expect(getVOILUTFunction({ voiLUTFunction: 'LINEAR_EXACT' })).toBe(
      'LINEAR_EXACT'
    );
  });

  it('reads the first item of an array, and the other spelling as a fallback', () => {
    expect(getVOILUTFunction({ voiLUTFunction: ['SIGMOID'] })).toBe('SIGMOID');
    expect(getVOILUTFunction({ voiLutFunction: 'SIGMOID' })).toBe('SIGMOID');
    expect(getVOILUTFunction({})).toBeUndefined();
    expect(getVOILUTFunction(undefined)).toBeUndefined();
  });
});
