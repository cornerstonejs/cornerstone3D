import { metaData } from '@cornerstonejs/metadata';
import getDimensionGroupIndexMap from '../src/utilities/getDimensionGroupIndexMap';

// Exercises the real 4D splitting rather than a stub, because whether a stack
// splits at all is what decides if callers can separate dimension groups.
const SLICE_SPACING = 2;

function makeImageId(timePoint, sliceIndex) {
  return `4d:t${timePoint}-s${sliceIndex}`;
}

/** Flat imageIds in acquisition order: all slices of t1, then all of t2, ... */
function make4DImageIds(timePointCount, sliceCount) {
  const imageIds = [];

  for (let timePoint = 1; timePoint <= timePointCount; timePoint++) {
    for (let sliceIndex = 0; sliceIndex < sliceCount; sliceIndex++) {
      imageIds.push(makeImageId(timePoint, sliceIndex));
    }
  }

  return imageIds;
}

function parseImageId(imageId) {
  const match = /^4d:t(\d+)-s(\d+)$/.exec(imageId);

  return match
    ? { timePoint: Number(match[1]), sliceIndex: Number(match[2]) }
    : undefined;
}

/**
 * Provides just enough for splitImageIdsBy4DTags: a position per slice (shared
 * across time points) and a TemporalPositionIdentifier per time point.
 */
function provider(type, imageId) {
  const parsed = typeof imageId === 'string' && parseImageId(imageId);

  if (!parsed) {
    return;
  }

  if (type === 'imagePlaneModule') {
    return {
      imagePositionPatient: [0, 0, parsed.sliceIndex * SLICE_SPACING],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      rows: 8,
      columns: 8,
    };
  }

  if (type === 'TemporalPositionIdentifier') {
    return parsed.timePoint;
  }
}

describe('getDimensionGroupIndexMap', () => {
  beforeAll(() => {
    metaData.addProvider(provider, 10000);
  });

  afterAll(() => {
    metaData.removeProvider(provider);
  });

  it('maps every imageId of a 4D stack to its dimension group', () => {
    const imageIds = make4DImageIds(3, 2);

    const dimensionGroupIndexMap = getDimensionGroupIndexMap(imageIds);

    expect(dimensionGroupIndexMap).toBeDefined();
    expect(dimensionGroupIndexMap.size).toBe(imageIds.length);

    imageIds.forEach((imageId) => {
      // Groups are ordered by TemporalPositionIdentifier, which is 1-based.
      expect(dimensionGroupIndexMap.get(imageId)).toBe(
        parseImageId(imageId).timePoint - 1
      );
    });
  });

  it('puts the same slice at different time points in different groups', () => {
    const dimensionGroupIndexMap = getDimensionGroupIndexMap(
      make4DImageIds(3, 2)
    );

    expect(dimensionGroupIndexMap.get(makeImageId(1, 1))).not.toBe(
      dimensionGroupIndexMap.get(makeImageId(3, 1))
    );
  });

  it('puts different slices at the same time point in one group', () => {
    const dimensionGroupIndexMap = getDimensionGroupIndexMap(
      make4DImageIds(3, 2)
    );

    expect(dimensionGroupIndexMap.get(makeImageId(2, 0))).toBe(
      dimensionGroupIndexMap.get(makeImageId(2, 1))
    );
  });

  it('returns undefined for a plain 3D stack', () => {
    expect(getDimensionGroupIndexMap(make4DImageIds(1, 4))).toBeUndefined();
  });

  it('returns undefined for stacks too small to split', () => {
    expect(getDimensionGroupIndexMap([])).toBeUndefined();
    expect(getDimensionGroupIndexMap([makeImageId(1, 0)])).toBeUndefined();
    expect(getDimensionGroupIndexMap(undefined)).toBeUndefined();
  });

  it('returns undefined when the images carry no 4D metadata', () => {
    expect(
      getDimensionGroupIndexMap(['unknown:a', 'unknown:b', 'unknown:c'])
    ).toBeUndefined();
  });
});
