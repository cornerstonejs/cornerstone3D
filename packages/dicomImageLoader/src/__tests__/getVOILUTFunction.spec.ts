import getVOILUTFunction from '../imageLoader/getVOILUTFunction';

describe('getVOILUTFunction', () => {
  it('returns the whole value when the provider gives a string', () => {
    expect(getVOILUTFunction({ voiLUTFunction: 'LINEAR' })).toBe('LINEAR');
    expect(getVOILUTFunction({ voiLUTFunction: 'SIGMOID' })).toBe('SIGMOID');
  });

  it('returns the first value when the provider gives an array', () => {
    expect(getVOILUTFunction({ voiLUTFunction: ['SIGMOID'] })).toBe('SIGMOID');
  });

  it('falls back to the voiLutFunction spelling', () => {
    expect(getVOILUTFunction({ voiLutFunction: 'LINEAR' })).toBe('LINEAR');
  });

  it('returns undefined when the module has no VOI LUT Function', () => {
    expect(getVOILUTFunction({})).toBeUndefined();
    expect(getVOILUTFunction({ voiLUTFunction: '' })).toBeUndefined();
    expect(getVOILUTFunction(undefined)).toBeUndefined();
  });
});
