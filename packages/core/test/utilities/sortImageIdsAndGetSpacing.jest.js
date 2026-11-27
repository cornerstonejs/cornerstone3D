import * as metaData from '../../src/metaData';
import sortImageIdsAndGetSpacing from '../../src/utilities/sortImageIdsAndGetSpacing';

const IMAGE_PLANE = 'imagePlaneModule';

/**
 * Axial slices 2 mm apart, z = zPositions[i] for the i-th imageId.
 */
function registerSlices(scheme, zPositions) {
  const imageIds = zPositions.map((_, i) => `${scheme}:slice-${i}`);
  const planes = new Map(
    imageIds.map((imageId, i) => [
      imageId,
      {
        imagePositionPatient: [0, 0, zPositions[i]],
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
        rowCosines: [1, 0, 0],
        columnCosines: [0, 1, 0],
        rowPixelSpacing: 1,
        columnPixelSpacing: 1,
        rows: 4,
        columns: 4,
      },
    ])
  );
  const provider = (type, imageId) =>
    type === IMAGE_PLANE ? planes.get(imageId) : undefined;

  metaData.addProvider(provider, 10000);

  return { imageIds, provider };
}

describe('sortImageIdsAndGetSpacing', () => {
  let provider;

  afterEach(() => {
    metaData.removeProvider(provider);
  });

  // With wadouri only the first and middle images have metadata, so the order
  // of the imageIds is kept, or reversed when it runs against the scan axis.
  it('returns a reversed copy for wadouri imageIds that run against the scan axis, and leaves the input as it was', () => {
    const registered = registerSlices('wadouri', [6, 4, 2, 0]);
    provider = registered.provider;
    const input = [...registered.imageIds];

    const { sortedImageIds } = sortImageIdsAndGetSpacing(input, [0, 0, 1]);

    expect(sortedImageIds).toEqual([...registered.imageIds].reverse());
    expect(input).toEqual(registered.imageIds);
    expect(sortedImageIds).not.toBe(input);
  });

  it('keeps wadouri imageIds that already run along the scan axis, and leaves the input as it was', () => {
    const registered = registerSlices('wadouri', [0, 2, 4, 6]);
    provider = registered.provider;
    const input = [...registered.imageIds];

    const { sortedImageIds, origin } = sortImageIdsAndGetSpacing(
      input,
      [0, 0, 1]
    );

    expect(sortedImageIds).toEqual(registered.imageIds);
    expect(origin).toEqual([0, 0, 0]);
    expect(input).toEqual(registered.imageIds);
  });

  it('sorts other imageIds by position without changing the input', () => {
    const registered = registerSlices('wadors', [4, 0, 6, 2]);
    provider = registered.provider;
    const input = [...registered.imageIds];

    const { sortedImageIds, zSpacing } = sortImageIdsAndGetSpacing(
      input,
      [0, 0, 1]
    );

    expect(sortedImageIds).toEqual([
      'wadors:slice-1',
      'wadors:slice-3',
      'wadors:slice-0',
      'wadors:slice-2',
    ]);
    expect(zSpacing).toBeCloseTo(2);
    expect(input).toEqual(registered.imageIds);
  });
});
