import {
  hasValidAreaAnnotationDimensions,
  MINIMUM_AREA_ANNOTATION_DIMENSION,
} from '../src/utilities/areaAnnotationShapeUtils';

describe('area annotation shape dimensions', () => {
  it.each([
    ['negative', -1],
    ['zero', 0],
    ['below the minimum', MINIMUM_AREA_ANNOTATION_DIMENSION / 2],
    ['at the minimum', MINIMUM_AREA_ANNOTATION_DIMENSION],
    ['NaN', Number.NaN],
  ])('rejects a dimension that is %s', (_description, dimension) => {
    expect(hasValidAreaAnnotationDimensions(dimension)).toBe(false);
  });

  it('accepts dimensions above the minimum', () => {
    expect(
      hasValidAreaAnnotationDimensions(MINIMUM_AREA_ANNOTATION_DIMENSION * 2)
    ).toBe(true);
  });

  it('requires every supplied dimension to be valid', () => {
    expect(
      hasValidAreaAnnotationDimensions(1, MINIMUM_AREA_ANNOTATION_DIMENSION)
    ).toBe(false);
    expect(hasValidAreaAnnotationDimensions(1, 1)).toBe(true);
  });
});
