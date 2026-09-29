import { utilities } from '../src/index';

const { definedAttributesOf } = utilities;

describe('definedAttributesOf', () => {
  it('keeps an attribute that has a value', () => {
    expect(definedAttributesOf({ SeriesNumber: '3', Modality: 'SR' })).toEqual({
      SeriesNumber: '3',
      Modality: 'SR',
    });
  });

  it('drops an attribute whose value is undefined', () => {
    expect(
      definedAttributesOf({ SeriesNumber: undefined, Modality: 'SR' })
    ).toEqual({ Modality: 'SR' });
  });

  it('keeps a falsy value that is not undefined', () => {
    expect(
      definedAttributesOf({ SeriesNumber: 0, Modality: '', PixelData: null })
    ).toEqual({ SeriesNumber: 0, Modality: '', PixelData: null });
  });

  it('answers an empty object for an absent source', () => {
    expect(definedAttributesOf(undefined)).toEqual({});
    expect(definedAttributesOf(null)).toEqual({});
  });

  it('does not change the source', () => {
    const source = { SeriesNumber: undefined, Modality: 'SR' };

    definedAttributesOf(source);

    expect('SeriesNumber' in source).toBe(true);
  });

  it('protects the value a dataset already has when a module merges onto it', () => {
    const dataset = { SeriesNumber: '3', Modality: 'SR' };
    const module = { SeriesNumber: undefined, SeriesDescription: 'Revision' };

    Object.assign(dataset, definedAttributesOf(module));

    expect(dataset).toEqual({
      SeriesNumber: '3',
      Modality: 'SR',
      SeriesDescription: 'Revision',
    });
  });
});
